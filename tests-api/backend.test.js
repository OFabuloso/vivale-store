/**
 * Testes de integração do backend contra o ambiente local do Docker.
 *
 * Uso:
 *   docker compose up -d --build
 *   npm run test:api
 *
 * Os testes criam o usuário "teste-painel" e apagam as tentativas de login entre um caso e outro.
 */
const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const sharp = require('sharp');

const ENDERECO_BASE = process.env.ENDERECO_API || 'http://localhost:8081';
const USUARIO_TESTE = 'teste-painel';
const SENHA_TESTE = 'senha-de-teste-123';
const RAIZ_DO_PROJETO = path.join(__dirname, '..');

function rodarNoDocker(servico, comando, entrada = '') {
  return execFileSync('docker', ['compose', 'exec', '-T', servico, ...comando], {
    cwd: RAIZ_DO_PROJETO,
    input: entrada,
    encoding: 'utf8',
  });
}

function rodarSql(sql) {
  return rodarNoDocker('banco', ['mariadb', '-uvivale', '-pvivale-local', 'vivale', '-N', '-e', sql]);
}

/** Navegador simplificado: guarda o cookie de sessão e o token CSRF entre as requisições. */
function criarNavegador() {
  let cookieDeSessao = '';
  let tokenCsrf = '';

  async function requisitar(caminho, { metodo = 'GET', corpo, enviarCsrf = true, cabecalhos = {} } = {}) {
    const cabecalhosFinais = { ...cabecalhos };
    if (cookieDeSessao) cabecalhosFinais.Cookie = cookieDeSessao;
    if (metodo !== 'GET' && enviarCsrf) cabecalhosFinais['X-CSRF-Token'] = tokenCsrf;
    let corpoEnviado = corpo;
    if (corpo !== undefined && !(corpo instanceof FormData)) {
      cabecalhosFinais['Content-Type'] = 'application/json';
      corpoEnviado = JSON.stringify(corpo);
    }

    const resposta = await fetch(`${ENDERECO_BASE}/${caminho}`, {
      method: metodo,
      headers: cabecalhosFinais,
      body: corpoEnviado,
      redirect: 'manual',
    });
    const cookieRecebido = resposta.headers.get('set-cookie');
    if (cookieRecebido) cookieDeSessao = cookieRecebido.split(';')[0];
    const tipo = resposta.headers.get('content-type') || '';
    const dados = tipo.includes('json') ? await resposta.json() : null;
    if (dados && dados.tokenCsrf) tokenCsrf = dados.tokenCsrf;
    return { status: resposta.status, dados, resposta };
  }

  async function entrar(usuario = USUARIO_TESTE, senha = SENHA_TESTE) {
    await requisitar('api/sessao.php');
    return requisitar('api/sessao.php', { metodo: 'POST', corpo: { usuario, senha } });
  }

  return { requisitar, entrar };
}

before(() => {
  rodarNoDocker('web', ['php', 'ferramentas/criar-usuario.php', USUARIO_TESTE, 'Teste do Painel'], `${SENHA_TESTE}\n`);
});

beforeEach(() => {
  rodarSql('DELETE FROM tentativas_login');
});

// ---------- Catálogo público ----------

test('o catálogo público traz os produtos ativos e só os contatos ligados', async () => {
  rodarSql(
    "INSERT INTO contatos (id, nome, numero, ativo, ordem) VALUES ('contato-teste-off', 'Desligado', '5521900001111', 0, 9) " +
      'ON DUPLICATE KEY UPDATE ativo = 0',
  );
  const navegador = criarNavegador();
  const { status, dados } = await navegador.requisitar('api/catalogo.php');

  assert.equal(status, 200);
  assert.ok(dados.produtos.length > 0);
  assert.ok(dados.produtos.every((produto) => produto.ativo === true));
  assert.ok(Array.isArray(dados.produtos[0].tamanhos));
  assert.ok(dados.configuracao.contatosWhatsApp.every((contato) => contato.ativo === true));
  assert.ok(!dados.configuracao.contatosWhatsApp.some((contato) => contato.id === 'contato-teste-off'));
  assert.equal(typeof dados.configuracao.valorMinimo, 'number');
  rodarSql("DELETE FROM contatos WHERE id = 'contato-teste-off'");
});

// ---------- Login ----------

test('o painel abre sem a senha do servidor; quem protege é o login do painel', async () => {
  const visitante = criarNavegador();
  assert.equal((await visitante.requisitar('admin.html')).status, 200);
  const sessao = await visitante.requisitar('api/sessao.php');
  assert.equal(sessao.status, 200);
  assert.equal(sessao.dados.usuario, null);
  assert.equal((await visitante.requisitar('api/admin/painel.php')).status, 401);
  assert.equal((await visitante.requisitar('api/admin/usuarios.php')).status, 401);
});

test('sem login, a API do painel responde 401', async () => {
  const navegador = criarNavegador();
  const { status, dados } = await navegador.requisitar('api/admin/painel.php');
  assert.equal(status, 401);
  assert.match(dados.erro, /login/);
});

test('login com senha certa abre o painel; senha errada não', async () => {
  const navegadorErrado = criarNavegador();
  const tentativaErrada = await navegadorErrado.entrar(USUARIO_TESTE, 'senha-errada');
  assert.equal(tentativaErrada.status, 401);
  assert.equal(tentativaErrada.dados.erro, 'Usuário ou senha incorretos.');

  const usuarioInexistente = await navegadorErrado.entrar('nao-existe', 'qualquer');
  assert.equal(usuarioInexistente.dados.erro, 'Usuário ou senha incorretos.');

  const navegador = criarNavegador();
  const login = await navegador.entrar();
  assert.equal(login.status, 200);
  assert.equal(login.dados.usuario.usuario, USUARIO_TESTE);
  assert.equal(login.dados.usuario.senha_hash, undefined);

  const painel = await navegador.requisitar('api/admin/painel.php');
  assert.equal(painel.status, 200);
  assert.ok(painel.dados.produtos.length > 0);
});

test('o cookie de sessão é HttpOnly e SameSite=Strict', async () => {
  const navegador = criarNavegador();
  const { resposta } = await navegador.requisitar('api/sessao.php');
  const cookie = resposta.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
});

test('bloqueia o usuário depois de 5 senhas erradas', async () => {
  const navegador = criarNavegador();
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    assert.equal((await navegador.entrar(USUARIO_TESTE, 'senha-errada')).status, 401);
  }
  // Nem a senha certa entra enquanto o bloqueio durar
  const bloqueado = await navegador.entrar();
  assert.equal(bloqueado.status, 429);
  assert.match(bloqueado.dados.erro, /15 minutos/);
});

test('alteração sem token CSRF ou de outro site é recusada', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();

  const semToken = await navegador.requisitar('api/admin/configuracao.php', {
    metodo: 'PUT',
    corpo: { valorMinimo: 1 },
    enviarCsrf: false,
  });
  assert.equal(semToken.status, 403);

  const outroSite = await navegador.requisitar('api/admin/configuracao.php', {
    metodo: 'PUT',
    corpo: { valorMinimo: 1 },
    cabecalhos: { Origin: 'https://site-malicioso.example' },
  });
  assert.equal(outroSite.status, 403);

  const mesmoNomeOutraPorta = await navegador.requisitar('api/admin/configuracao.php', {
    metodo: 'PUT',
    corpo: { valorMinimo: 1 },
    cabecalhos: { Origin: `${new URL(ENDERECO_BASE).protocol}//${new URL(ENDERECO_BASE).hostname}:9999` },
  });
  assert.equal(mesmoNomeOutraPorta.status, 403);
});

test('alteração vinda do próprio site (Origin com porta) é aceita', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const valorAtual = (await navegador.requisitar('api/admin/painel.php')).dados.configuracao.valorMinimo;
  const resposta = await navegador.requisitar('api/admin/configuracao.php', {
    metodo: 'PUT',
    corpo: { valorMinimo: valorAtual },
    cabecalhos: { Origin: new URL(ENDERECO_BASE).origin },
  });
  assert.equal(resposta.status, 200);
});

test('depois de sair, a sessão não vale mais', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  assert.equal((await navegador.requisitar('api/sessao.php', { metodo: 'DELETE' })).status, 200);
  assert.equal((await navegador.requisitar('api/admin/painel.php')).status, 401);
});

// ---------- Equipe e papéis ----------

const USUARIO_FUNCIONARIO = 'teste-funcionario';

test('o dono cadastra um funcionário, que só mexe em produtos', async () => {
  rodarSql(`DELETE FROM usuarios WHERE usuario = '${USUARIO_FUNCIONARIO}'`);
  const dono = criarNavegador();
  await dono.entrar();

  const cadastro = await dono.requisitar('api/admin/usuarios.php', {
    metodo: 'POST',
    corpo: { usuario: USUARIO_FUNCIONARIO, nome: 'Funcionário de Teste', senha: 'senha-funcionario-1' },
  });
  assert.equal(cadastro.status, 201);
  const funcionario = cadastro.dados.usuarios.find((usuario) => usuario.usuario === USUARIO_FUNCIONARIO);
  assert.equal(funcionario.papel, 'funcionario');
  assert.equal(funcionario.ativo, true);
  assert.ok(!('senha_hash' in funcionario));

  const repetido = await dono.requisitar('api/admin/usuarios.php', {
    metodo: 'POST',
    corpo: { usuario: USUARIO_FUNCIONARIO, nome: 'Outro', senha: 'senha-funcionario-1' },
  });
  assert.equal(repetido.status, 409);

  const navegadorFuncionario = criarNavegador();
  assert.equal((await navegadorFuncionario.entrar(USUARIO_FUNCIONARIO, 'senha-funcionario-1')).status, 200);
  const painel = await navegadorFuncionario.requisitar('api/admin/painel.php');
  assert.equal(painel.dados.usuario.papel, 'funcionario');

  // Cadastra e edita produto, mas não exclui
  const criado = await navegadorFuncionario.requisitar('api/admin/produtos.php', {
    metodo: 'POST',
    corpo: { nome: 'Blusa do Funcionário', categoria: 'Blusas', preco: 40, tamanhos: ['M'], cores: ['Azul'] },
  });
  assert.equal(criado.status, 200);
  const idProduto = criado.dados.produto.id;
  const exclusao = await navegadorFuncionario.requisitar(`api/admin/produtos.php?id=${idProduto}`, { metodo: 'DELETE' });
  assert.equal(exclusao.status, 403);

  // Contatos, configurações e equipe ficam só com o dono
  const recusas = [
    ['api/admin/contatos.php', 'PUT', { contatos: [] }],
    ['api/admin/configuracao.php', 'PUT', { valorMinimo: 1 }],
    ['api/admin/usuarios.php', 'GET', undefined],
    ['api/admin/usuarios.php', 'POST', { usuario: 'intruso', nome: 'Intruso', senha: 'senha-intruso-1' }],
  ];
  for (const [caminho, metodo, corpo] of recusas) {
    const { status } = await navegadorFuncionario.requisitar(caminho, { metodo, corpo });
    assert.equal(status, 403, `${metodo} ${caminho}`);
  }

  // A senha própria o funcionário troca
  const trocaDeSenha = await navegadorFuncionario.requisitar('api/admin/senha.php', {
    metodo: 'POST',
    corpo: { senhaAtual: 'senha-funcionario-1', novaSenha: 'senha-funcionario-2' },
  });
  assert.equal(trocaDeSenha.status, 200);

  assert.equal((await dono.requisitar(`api/admin/produtos.php?id=${idProduto}`, { metodo: 'DELETE' })).status, 200);
});

test('o dono redefine a senha e desativa o funcionário, que perde o acesso na hora', async () => {
  const dono = criarNavegador();
  await dono.entrar();
  const { usuarios } = (await dono.requisitar('api/admin/usuarios.php')).dados;
  const funcionario = usuarios.find((usuario) => usuario.usuario === USUARIO_FUNCIONARIO);
  const donoDaLista = usuarios.find((usuario) => usuario.usuario === USUARIO_TESTE);

  const senhaCurta = await dono.requisitar('api/admin/usuarios.php', { metodo: 'PUT', corpo: { id: funcionario.id, novaSenha: 'curta' } });
  assert.equal(senhaCurta.status, 422);
  const redefinida = await dono.requisitar('api/admin/usuarios.php', {
    metodo: 'PUT',
    corpo: { id: funcionario.id, novaSenha: 'senha-redefinida-1' },
  });
  assert.equal(redefinida.status, 200);

  const navegadorFuncionario = criarNavegador();
  assert.equal((await navegadorFuncionario.entrar(USUARIO_FUNCIONARIO, 'senha-redefinida-1')).status, 200);

  await dono.requisitar('api/admin/usuarios.php', { metodo: 'PUT', corpo: { id: funcionario.id, ativo: false } });
  assert.equal((await navegadorFuncionario.requisitar('api/admin/painel.php')).status, 401);
  assert.equal((await criarNavegador().entrar(USUARIO_FUNCIONARIO, 'senha-redefinida-1')).status, 401);

  // O dono não é alterado pela tela de equipe
  const alterarDono = await dono.requisitar('api/admin/usuarios.php', { metodo: 'PUT', corpo: { id: donoDaLista.id, ativo: false } });
  assert.equal(alterarDono.status, 404);

  rodarSql(`DELETE FROM usuarios WHERE usuario = '${USUARIO_FUNCIONARIO}'`);
});

// ---------- Produtos, contatos e configurações ----------

test('cria, edita, inativa e exclui um produto; a loja vê cada mudança na hora', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const loja = criarNavegador();
  const produtoNaLoja = async (idProduto) =>
    (await loja.requisitar('api/catalogo.php')).dados.produtos.find((produto) => produto.id === idProduto);

  const criado = await navegador.requisitar('api/admin/produtos.php', {
    metodo: 'POST',
    corpo: { nome: 'Vestido de Teste', categoria: 'Vestidos', preco: 89.9, tamanhos: ['P', 'XXL'], cores: ['Preto', 'Preto', ' '], descricao: '<b>leve</b>' },
  });
  assert.equal(criado.status, 200);
  const { produto } = criado.dados;
  assert.match(produto.id, /^prd-/);
  assert.deepEqual(produto.tamanhos, ['P']);
  assert.deepEqual(produto.cores, ['Preto']);
  assert.equal(produto.descricao, '<b>leve</b>'); // guardado como texto; a tela escapa ao mostrar
  assert.equal((await produtoNaLoja(produto.id)).nome, 'Vestido de Teste');

  const inativado = await navegador.requisitar('api/admin/produtos.php', {
    metodo: 'POST',
    corpo: { ...produto, nome: 'Vestido Editado', ativo: false },
  });
  assert.equal(inativado.dados.produto.nome, 'Vestido Editado');
  assert.equal(await produtoNaLoja(produto.id), undefined);

  const excluido = await navegador.requisitar(`api/admin/produtos.php?id=${produto.id}`, { metodo: 'DELETE' });
  assert.equal(excluido.status, 200);
  const deNovo = await navegador.requisitar(`api/admin/produtos.php?id=${produto.id}`, { metodo: 'DELETE' });
  assert.equal(deNovo.status, 404);
});

test('produto inválido é recusado com a mensagem certa', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const casos = [
    [{ categoria: 'Vestidos', preco: 10, tamanhos: ['P'], cores: ['Preto'] }, /nome/],
    [{ nome: 'Vestido', categoria: 'Vestidos', preco: -1, tamanhos: ['P'], cores: ['Preto'] }, /preço/],
    [{ nome: 'Vestido', categoria: 'Vestidos', preco: 10, tamanhos: [], cores: ['Preto'] }, /tamanho/],
    [{ nome: 'Vestido', categoria: 'Vestidos', preco: 10, tamanhos: ['P'], cores: ['Preto'], foto: 'javascript:alert(1)' }, /foto/],
    [{ nome: 'Vestido', categoria: 'Vestidos', preco: 10, tamanhos: ['P'], cores: ['Preto'], foto: 'data:image/png;base64,AAAA' }, /foto/],
    [{ id: "x' OR 1=1 --", nome: 'Vestido', categoria: 'Vestidos', preco: 10, tamanhos: ['P'], cores: ['Preto'] }, /Identificador/],
    [{ nome: 'Vestido', categoria: 'Vestidos', preco: 10, tamanhos: ['U', 'M'], cores: ['Preto'] }, /Tamanho único não combina/],
  ];
  for (const [produto, mensagemEsperada] of casos) {
    const { status, dados } = await navegador.requisitar('api/admin/produtos.php', { metodo: 'POST', corpo: produto });
    assert.equal(status, 422, JSON.stringify(produto));
    assert.match(dados.erro, mensagemEsperada);
  }
});

test('produto de tamanho único é salvo e aparece assim na loja', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const criado = await navegador.requisitar('api/admin/produtos.php', {
    metodo: 'POST',
    corpo: { nome: 'Corset Tamanho Único', categoria: 'Corsets', preco: 80, tamanhos: ['U'], cores: ['Preto'] },
  });
  assert.equal(criado.status, 200, JSON.stringify(criado.dados));
  try {
    const naLoja = (await criarNavegador().requisitar('api/catalogo.php')).dados.produtos.find((produto) => produto.id === criado.dados.produto.id);
    assert.deepEqual(naLoja.tamanhos, ['U']);
  } finally {
    await navegador.requisitar(`api/admin/produtos.php?id=${encodeURIComponent(criado.dados.produto.id)}`, { metodo: 'DELETE' });
  }
});

test('desligar um atendente tira ele do catálogo público na hora', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const loja = criarNavegador();
  const contatosDaLoja = async () => (await loja.requisitar('api/catalogo.php')).dados.configuracao.contatosWhatsApp;
  const contatosOriginais = (await navegador.requisitar('api/admin/painel.php')).dados.configuracao.contatosWhatsApp;

  try {
    const salvo = await navegador.requisitar('api/admin/contatos.php', {
      metodo: 'PUT',
      corpo: {
        contatos: [
          { id: 'contato-a', nome: 'Vendas', numero: '(21) 91111-2222', ativo: true },
          { id: 'contato-b', nome: 'Gerência', numero: '21933334444', ativo: false },
        ],
      },
    });
    assert.equal(salvo.status, 200);
    assert.equal(salvo.dados.contatosWhatsApp[0].numero, '5521911112222');
    assert.deepEqual((await contatosDaLoja()).map((contato) => contato.nome), ['Vendas']);

    await navegador.requisitar('api/admin/contatos.php', {
      metodo: 'PUT',
      corpo: { contatos: [{ id: 'contato-a', nome: 'Vendas', numero: '21911112222', ativo: false }] },
    });
    assert.deepEqual(await contatosDaLoja(), []);

    const repetido = await navegador.requisitar('api/admin/contatos.php', {
      metodo: 'PUT',
      corpo: { contatos: [{ nome: 'A', numero: '21911112222' }, { nome: 'B', numero: '5521911112222' }] },
    });
    assert.equal(repetido.status, 422);
    assert.match(repetido.dados.erro, /"B"/);
  } finally {
    await navegador.requisitar('api/admin/contatos.php', { metodo: 'PUT', corpo: { contatos: contatosOriginais } });
  }
});

test('salva o valor mínimo e recusa valor inválido', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const valorOriginal = (await navegador.requisitar('api/admin/painel.php')).dados.configuracao.valorMinimo;
  try {
    const salvo = await navegador.requisitar('api/admin/configuracao.php', { metodo: 'PUT', corpo: { valorMinimo: 350.5 } });
    assert.equal(salvo.dados.valorMinimo, 350.5);
    const invalido = await navegador.requisitar('api/admin/configuracao.php', { metodo: 'PUT', corpo: { valorMinimo: 'abc' } });
    assert.equal(invalido.status, 422);
  } finally {
    await navegador.requisitar('api/admin/configuracao.php', { metodo: 'PUT', corpo: { valorMinimo: valorOriginal } });
  }
});

// ---------- Fotos ----------

/** Foto PNG pequena gerada na hora (com o sharp, já usado em ferramentas/otimizar-fotos.js). */
function criarPngPequeno() {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: '#c49a62' } }).png().toBuffer();
}

test('envia uma foto, gera as versões e entrega pelo endereço fotos/', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const formulario = new FormData();
  formulario.append('foto', new Blob([await criarPngPequeno()], { type: 'image/png' }), 'foto.png');

  const envio = await navegador.requisitar('api/admin/fotos.php', { metodo: 'POST', corpo: formulario });
  assert.equal(envio.status, 201, JSON.stringify(envio.dados));
  assert.match(envio.dados.foto, /^fotos\/[a-f0-9]{32}\.jpg$/);

  const loja = criarNavegador();
  const jpeg = await loja.requisitar(envio.dados.foto);
  assert.equal(jpeg.status, 200);
  assert.equal(jpeg.resposta.headers.get('content-type'), 'image/jpeg');
  const webp = await loja.requisitar(envio.dados.foto.replace('.jpg', '-400.webp'));
  assert.equal(webp.status, 200);
  assert.equal(webp.resposta.headers.get('content-type'), 'image/webp');
});

test('recusa arquivo que finge ser foto', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const formulario = new FormData();
  formulario.append('foto', new Blob(['<?php echo "invasão"; ?>'], { type: 'image/jpeg' }), 'foto.jpg');
  const envio = await navegador.requisitar('api/admin/fotos.php', { metodo: 'POST', corpo: formulario });
  assert.equal(envio.status, 422);
  assert.match(envio.dados.erro, /JPEG, PNG ou WebP/);
});

test('endereço de foto inventado ou com caminho de pasta dá 404', async () => {
  const loja = criarNavegador();
  assert.equal((await loja.requisitar(`fotos/${'0'.repeat(32)}.jpg`)).status, 404);
  assert.equal((await loja.requisitar('api/foto.php?arquivo=../config/vivale.php')).status, 404);
});

// ---------- Arquivos protegidos ----------

test('peças internas e arquivos de desenvolvimento ficam bloqueados', async () => {
  const loja = criarNavegador();
  const caminhosBloqueados = [
    'api/nucleo/banco.php',
    'api/sql/001_inicial.sql',
    'api/config.exemplo.php',
    'docker/dev/config/vivale.php',
    'docker-compose.yml',
    'tests-api/backend.test.js',
    'ferramentas/criar-usuario.php',
    'ferramentas/backup.php',
    'api/nucleo/backup.php',
  ];
  for (const caminho of caminhosBloqueados) {
    assert.equal((await loja.requisitar(caminho)).status, 403, caminho);
  }
});

// ---------- Backup ----------

const USUARIO_FUNCIONARIO_BACKUP = 'teste-func-backup';
const PASTA_DE_BACKUPS_NO_DOCKER = '/home/u151095779/domains/vivalestore.com.br/backups';

function contarLinhas(tabela, banco = 'vivale') {
  const sql = `SELECT COUNT(*) FROM ${banco}.${tabela}`;
  return Number(rodarNoDocker('banco', ['mariadb', '-uroot', '-pvivale-root-local', '-N', '-e', sql]).trim());
}

test('só o dono baixa o backup; o funcionário é recusado', async () => {
  rodarNoDocker('web', ['php', 'ferramentas/criar-usuario.php', USUARIO_FUNCIONARIO_BACKUP, 'Funcionário Backup'], `${SENHA_TESTE}\n`);
  rodarSql(`UPDATE usuarios SET papel = 'funcionario' WHERE usuario = '${USUARIO_FUNCIONARIO_BACKUP}'`);
  const funcionario = criarNavegador();
  await funcionario.entrar(USUARIO_FUNCIONARIO_BACKUP, SENHA_TESTE);
  assert.equal((await funcionario.requisitar('api/admin/backup.php')).status, 403);
  assert.equal((await funcionario.requisitar('api/admin/painel.php')).dados.backup, undefined);

  const semLogin = criarNavegador();
  assert.equal((await semLogin.requisitar('api/admin/backup.php')).status, 401);
});

test('o backup baixado tem banco e fotos, e restaurar o banco.sql recria tudo', async () => {
  const dono = criarNavegador();
  await dono.entrar();
  const formulario = new FormData();
  formulario.append('foto', new Blob([await criarPngPequeno()], { type: 'image/png' }), 'foto.png');
  const fotoEnviada = (await dono.requisitar('api/admin/fotos.php', { metodo: 'POST', corpo: formulario })).dados.foto;
  const nomeDaFoto = fotoEnviada.replace('fotos/', '');
  // Contagens antes do download: baixar também anota a data e registra a ação no banco
  const TABELAS_CONFERIDAS = ['produtos', 'contatos', 'configuracoes', 'usuarios', 'auditoria'];
  const linhasAntesDoBackup = Object.fromEntries(TABELAS_CONFERIDAS.map((tabela) => [tabela, contarLinhas(tabela)]));

  const download = await dono.requisitar('api/admin/backup.php');
  assert.equal(download.status, 200);
  assert.equal(download.resposta.headers.get('content-type'), 'application/zip');
  assert.match(download.resposta.headers.get('content-disposition'), /filename="vivale-backup-\d{4}-\d{2}-\d{2}-\d{6}\.zip"/);

  const pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'vivale-backup-'));
  try {
    const caminhoZip = path.join(pastaTemporaria, 'backup.zip');
    fs.writeFileSync(caminhoZip, Buffer.from(await download.resposta.arrayBuffer()));
    const conteudoDoZip = execFileSync('unzip', ['-Z1', caminhoZip], { encoding: 'utf8' }).split('\n');
    assert.ok(conteudoDoZip.includes('banco.sql'));
    assert.ok(conteudoDoZip.includes('LEIA-ME.txt'));
    assert.ok(conteudoDoZip.includes(`fotos/${nomeDaFoto}`));
    assert.ok(conteudoDoZip.includes(`fotos/${nomeDaFoto.replace('.jpg', '-400.webp')}`));

    // Restaura num banco vazio e confere se ficou igual ao original
    const bancoSql = execFileSync('unzip', ['-p', caminhoZip, 'banco.sql'], { encoding: 'utf8' });
    assert.doesNotMatch(bancoSql, /INSERT INTO `tentativas_login`/);
    const comandoRoot = ['mariadb', '-uroot', '-pvivale-root-local'];
    rodarNoDocker('banco', [...comandoRoot, '-e', 'DROP DATABASE IF EXISTS vivale_restaurado; CREATE DATABASE vivale_restaurado']);
    try {
      rodarNoDocker('banco', [...comandoRoot, 'vivale_restaurado'], bancoSql);
      for (const tabela of TABELAS_CONFERIDAS) {
        assert.equal(contarLinhas(tabela, 'vivale_restaurado'), linhasAntesDoBackup[tabela], tabela);
      }
      const nomesOriginais = rodarSql('SELECT nome FROM produtos ORDER BY id');
      const nomesRestaurados = rodarNoDocker('banco', [...comandoRoot, '-N', '-e', 'SELECT nome FROM vivale_restaurado.produtos ORDER BY id']);
      assert.equal(nomesRestaurados, nomesOriginais);
    } finally {
      rodarNoDocker('banco', [...comandoRoot, '-e', 'DROP DATABASE IF EXISTS vivale_restaurado']);
    }
  } finally {
    fs.rmSync(pastaTemporaria, { recursive: true, force: true });
  }

  const situacao = (await dono.requisitar('api/admin/painel.php')).dados.backup;
  assert.ok(situacao.ultimoBaixado, 'o painel deveria mostrar a data do último backup baixado');
  assert.ok(Date.now() - new Date(situacao.ultimoBaixado) < 60_000);
});

test('a cópia automática cria o backup no servidor e guarda só os 14 mais recentes', async () => {
  // 16 backups antigos de mentira: depois de rodar, sobram os 13 mais novos deles + o de hoje
  rodarNoDocker('web', ['sh', '-c', `mkdir -p ${PASTA_DE_BACKUPS_NO_DOCKER} && rm -f ${PASTA_DE_BACKUPS_NO_DOCKER}/*.zip && for dia in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16; do touch ${PASTA_DE_BACKUPS_NO_DOCKER}/vivale-backup-2000-01-$dia-030000.zip; done`]);

  const saida = rodarNoDocker('web', ['php', 'ferramentas/backup.php']);
  assert.match(saida, /Backup criado: .*vivale-backup-\d{4}-\d{2}-\d{2}-\d{6}\.zip/);

  const backupsGuardados = rodarNoDocker('web', ['sh', '-c', `ls ${PASTA_DE_BACKUPS_NO_DOCKER}`]).trim().split('\n');
  assert.equal(backupsGuardados.length, 14);
  assert.ok(!backupsGuardados.includes('vivale-backup-2000-01-01-030000.zip'), 'o mais antigo deveria ter sido apagado');
  assert.ok(!backupsGuardados.includes('vivale-backup-2000-01-03-030000.zip'));
  assert.ok(backupsGuardados.includes('vivale-backup-2000-01-04-030000.zip'));

  const dono = criarNavegador();
  await dono.entrar();
  assert.ok((await dono.requisitar('api/admin/painel.php')).dados.backup.ultimoAutomatico);
  rodarNoDocker('web', ['sh', '-c', `rm -f ${PASTA_DE_BACKUPS_NO_DOCKER}/*.zip`]);
});

// ---------- Verificação em duas etapas (2FA) ----------

const crypto = require('node:crypto');

const USUARIO_2FA = 'teste-2fa';
const USUARIO_FUNCIONARIO_2FA = 'teste-func-2fa';

/** Mesmo cálculo do app autenticador (TOTP, RFC 6238), para o teste gerar códigos válidos. */
function passoAtualDoTotp() {
  return Math.floor(Date.now() / 1000 / 30);
}

function calcularCodigoTotp(segredoBase32, passo = passoAtualDoTotp()) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...segredoBase32].map((letra) => alfabeto.indexOf(letra).toString(2).padStart(5, '0')).join('');
  const segredo = Buffer.from(bits.match(/.{8}/g).map((grupo) => parseInt(grupo, 2)));
  const mensagem = Buffer.alloc(8);
  mensagem.writeBigUInt64BE(BigInt(passo));
  const assinatura = crypto.createHmac('sha1', segredo).update(mensagem).digest();
  const deslocamento = assinatura[19] & 0x0f;
  return String((assinatura.readUInt32BE(deslocamento) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

function criarUsuarioDeTeste(usuario, papel) {
  rodarNoDocker('web', ['php', 'ferramentas/criar-usuario.php', usuario, `Usuário ${usuario}`], `${SENHA_TESTE}\n`);
  rodarSql(`UPDATE usuarios SET papel = '${papel}', totp_segredo = NULL, totp_ultimo_passo = NULL WHERE usuario = '${usuario}'`);
  rodarSql(`DELETE codigos_recuperacao FROM codigos_recuperacao JOIN usuarios ON usuarios.id = codigos_recuperacao.usuario_id WHERE usuarios.usuario = '${usuario}'`);
}

/** Liga o 2FA da pessoa logada e devolve o segredo e os códigos de recuperação. */
async function ativarDoisFatoresPeloPainel(navegador) {
  const inicio = await navegador.requisitar('api/admin/dois-fatores.php', { metodo: 'POST', corpo: { acao: 'iniciar', senha: SENHA_TESTE } });
  assert.equal(inicio.status, 200, JSON.stringify(inicio.dados));
  const passoDaAtivacao = passoAtualDoTotp();
  const confirmacao = await navegador.requisitar('api/admin/dois-fatores.php', {
    metodo: 'POST',
    corpo: { acao: 'confirmar', codigo: calcularCodigoTotp(inicio.dados.segredo, passoDaAtivacao) },
  });
  assert.equal(confirmacao.status, 200, JSON.stringify(confirmacao.dados));
  return { segredo: inicio.dados.segredo, passoDaAtivacao, codigos: confirmacao.dados.codigosRecuperacao };
}

test('ativar o 2FA pede a senha, confere o código do app e entrega 10 códigos de recuperação', async () => {
  criarUsuarioDeTeste(USUARIO_2FA, 'dono');
  const navegador = criarNavegador();
  await navegador.entrar(USUARIO_2FA, SENHA_TESTE);
  assert.equal((await navegador.requisitar('api/admin/dois-fatores.php')).dados.ativo, false);
  assert.equal((await navegador.requisitar('api/admin/painel.php')).dados.usuario.doisFatores, false);

  const senhaErrada = await navegador.requisitar('api/admin/dois-fatores.php', { metodo: 'POST', corpo: { acao: 'iniciar', senha: 'errada-123456' } });
  assert.equal(senhaErrada.status, 422);

  const inicio = await navegador.requisitar('api/admin/dois-fatores.php', { metodo: 'POST', corpo: { acao: 'iniciar', senha: SENHA_TESTE } });
  assert.match(inicio.dados.segredo, /^[A-Z2-7]{32}$/);
  assert.match(inicio.dados.enderecoOtpauth, /^otpauth:\/\/totp\/Vivale%20Store%3Ateste-2fa\?secret=[A-Z2-7]{32}&issuer=Vivale%20Store/);
  // Antes de confirmar, nada vai para o banco
  assert.equal(rodarSql(`SELECT totp_segredo IS NULL FROM usuarios WHERE usuario = '${USUARIO_2FA}'`).trim(), '1');

  const codigoErrado = await navegador.requisitar('api/admin/dois-fatores.php', { metodo: 'POST', corpo: { acao: 'confirmar', codigo: '000000' } });
  assert.equal(codigoErrado.status, 422);

  const confirmacao = await navegador.requisitar('api/admin/dois-fatores.php', {
    metodo: 'POST',
    corpo: { acao: 'confirmar', codigo: calcularCodigoTotp(inicio.dados.segredo) },
  });
  assert.equal(confirmacao.status, 200);
  assert.equal(confirmacao.dados.codigosRecuperacao.length, 10);
  assert.ok(confirmacao.dados.codigosRecuperacao.every((codigo) => /^[a-z2-9]{4}-[a-z2-9]{4}$/.test(codigo)));
  assert.deepEqual({ ativo: confirmacao.dados.ativo, codigosRestantes: confirmacao.dados.codigosRestantes }, { ativo: true, codigosRestantes: 10 });

  // No banco, o segredo fica criptografado e os códigos de recuperação só como hash
  const segredoNoBanco = rodarSql(`SELECT totp_segredo FROM usuarios WHERE usuario = '${USUARIO_2FA}'`);
  assert.ok(!segredoNoBanco.includes(inicio.dados.segredo));
  const codigosNoBanco = rodarSql('SELECT codigo_hash FROM codigos_recuperacao');
  assert.ok(!codigosNoBanco.includes(confirmacao.dados.codigosRecuperacao[0]));
  assert.equal(rodarSql(`SELECT COUNT(*) FROM auditoria WHERE acao = 'dois_fatores_ativado'`).trim() !== '0', true);
});

test('com 2FA, a senha sozinha não entra: falta o código, que vale uma vez só', async () => {
  criarUsuarioDeTeste(USUARIO_2FA, 'dono');
  const configuracao = criarNavegador();
  await configuracao.entrar(USUARIO_2FA, SENHA_TESTE);
  // A confirmação usou o código de agora; o login usa o do próximo intervalo (dentro da tolerância)
  const { segredo, passoDaAtivacao } = await ativarDoisFatoresPeloPainel(configuracao);

  const navegador = criarNavegador();
  const primeiraEtapa = await navegador.entrar(USUARIO_2FA, SENHA_TESTE);
  assert.equal(primeiraEtapa.status, 200);
  assert.deepEqual({ usuario: primeiraEtapa.dados.usuario, precisaCodigo: primeiraEtapa.dados.precisaCodigo }, { usuario: null, precisaCodigo: true });
  assert.equal((await navegador.requisitar('api/admin/painel.php')).status, 401, 'só a senha não pode abrir o painel');

  const codigoJaUsado = calcularCodigoTotp(segredo, passoDaAtivacao);
  const repetido = await navegador.requisitar('api/sessao.php', { metodo: 'POST', corpo: { codigo: codigoJaUsado } });
  assert.equal(repetido.status, 422, 'o código usado na ativação não pode servir de novo');

  const segundaEtapa = await navegador.requisitar('api/sessao.php', { metodo: 'POST', corpo: { codigo: calcularCodigoTotp(segredo, passoDaAtivacao + 1) } });
  assert.equal(segundaEtapa.status, 200, JSON.stringify(segundaEtapa.dados));
  assert.equal(segundaEtapa.dados.usuario.usuario, USUARIO_2FA);
  assert.equal((await navegador.requisitar('api/admin/painel.php')).status, 200);
});

test('código de recuperação entra uma vez; errar 5 códigos bloqueia', async () => {
  criarUsuarioDeTeste(USUARIO_2FA, 'dono');
  const configuracao = criarNavegador();
  await configuracao.entrar(USUARIO_2FA, SENHA_TESTE);
  const { codigos } = await ativarDoisFatoresPeloPainel(configuracao);

  const comRecuperacao = criarNavegador();
  await comRecuperacao.entrar(USUARIO_2FA, SENHA_TESTE);
  // Aceita maiúsculas e sem hífen
  const entrada = await comRecuperacao.requisitar('api/sessao.php', { metodo: 'POST', corpo: { codigo: codigos[0].replace('-', '').toUpperCase() } });
  assert.equal(entrada.status, 200, JSON.stringify(entrada.dados));
  assert.equal((await comRecuperacao.requisitar('api/admin/dois-fatores.php')).dados.codigosRestantes, 9);

  const deNovo = criarNavegador();
  await deNovo.entrar(USUARIO_2FA, SENHA_TESTE);
  assert.equal((await deNovo.requisitar('api/sessao.php', { metodo: 'POST', corpo: { codigo: codigos[0] } })).status, 422);

  for (let tentativa = 2; tentativa <= 5; tentativa++) {
    assert.equal((await deNovo.requisitar('api/sessao.php', { metodo: 'POST', corpo: { codigo: '000000' } })).status, 422);
  }
  // Bloqueado: nem o código de recuperação certo passa
  assert.equal((await deNovo.requisitar('api/sessao.php', { metodo: 'POST', corpo: { codigo: codigos[1] } })).status, 429);
});

test('desativar o 2FA pede senha e código; o dono desliga o 2FA de um funcionário', async () => {
  criarUsuarioDeTeste(USUARIO_2FA, 'dono');
  const dono2fa = criarNavegador();
  await dono2fa.entrar(USUARIO_2FA, SENHA_TESTE);
  const { codigos } = await ativarDoisFatoresPeloPainel(dono2fa);
  const semCodigo = await dono2fa.requisitar('api/admin/dois-fatores.php', { metodo: 'POST', corpo: { acao: 'desativar', senha: SENHA_TESTE, codigo: '' } });
  assert.equal(semCodigo.status, 422);
  const desativado = await dono2fa.requisitar('api/admin/dois-fatores.php', { metodo: 'POST', corpo: { acao: 'desativar', senha: SENHA_TESTE, codigo: codigos[2] } });
  assert.equal(desativado.status, 200, JSON.stringify(desativado.dados));
  assert.equal(desativado.dados.ativo, false);
  assert.equal(rodarSql(`SELECT COUNT(*) FROM codigos_recuperacao JOIN usuarios ON usuarios.id = usuario_id WHERE usuario = '${USUARIO_2FA}'`).trim(), '0');

  criarUsuarioDeTeste(USUARIO_FUNCIONARIO_2FA, 'funcionario');
  const funcionario = criarNavegador();
  await funcionario.entrar(USUARIO_FUNCIONARIO_2FA, SENHA_TESTE);
  await ativarDoisFatoresPeloPainel(funcionario);

  const dono = criarNavegador();
  await dono.entrar();
  const equipe = (await dono.requisitar('api/admin/usuarios.php')).dados.usuarios;
  const funcionarioNaEquipe = equipe.find((usuario) => usuario.usuario === USUARIO_FUNCIONARIO_2FA);
  assert.equal(funcionarioNaEquipe.doisFatores, true);
  // O funcionário não desliga o 2FA de ninguém pela equipe
  assert.equal((await funcionario.requisitar('api/admin/usuarios.php', { metodo: 'PUT', corpo: { id: funcionarioNaEquipe.id, desativarDoisFatores: true } })).status, 403);

  const desligado = await dono.requisitar('api/admin/usuarios.php', { metodo: 'PUT', corpo: { id: funcionarioNaEquipe.id, desativarDoisFatores: true } });
  assert.equal(desligado.status, 200);
  assert.equal(desligado.dados.usuarios.find((usuario) => usuario.usuario === USUARIO_FUNCIONARIO_2FA).doisFatores, false);

  const entradaSemCodigo = await criarNavegador().entrar(USUARIO_FUNCIONARIO_2FA, SENHA_TESTE);
  assert.ok(entradaSemCodigo.dados.usuario, 'depois de desligado, o funcionário entra só com a senha');
  rodarSql(`UPDATE usuarios SET ativo = 0 WHERE usuario IN ('${USUARIO_2FA}', '${USUARIO_FUNCIONARIO_2FA}')`);
});

// ---------- Estoque ----------

/** Cria um produto de teste com controle de estoque e devolve o produto salvo. */
async function criarProdutoComEstoque(navegador, estoque, extras = {}) {
  const resposta = await navegador.requisitar('api/admin/produtos.php', {
    metodo: 'POST',
    corpo: {
      nome: 'Produto Estoque Teste',
      categoria: 'Testes',
      preco: 50,
      tamanhos: ['P', 'M'],
      cores: ['Preto'],
      controlaEstoque: true,
      alertaEstoque: 2,
      estoque,
      estoqueVisto: {},
      ...extras,
    },
  });
  assert.equal(resposta.status, 200, JSON.stringify(resposta.dados));
  return resposta.dados.produto;
}

async function excluirProdutoDeTeste(navegador, idProduto) {
  await navegador.requisitar(`api/admin/produtos.php?id=${encodeURIComponent(idProduto)}`, { metodo: 'DELETE' });
}

test('estoque por tamanho e cor: a loja só vê o que está esgotado e o painel avisa o mínimo', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const produto = await criarProdutoComEstoque(navegador, { 'P|Preto': 5, 'M|Preto': 0 });
  try {
    assert.deepEqual(produto.estoque, { 'P|Preto': 5, 'M|Preto': 0 });
    assert.equal(rodarSql(`SELECT COUNT(*) FROM movimentos_estoque WHERE produto_id = '${produto.id}' AND motivo = 'ajuste'`).trim(), '1');

    const naLoja = (await criarNavegador().requisitar('api/catalogo.php')).dados.produtos.find((item) => item.id === produto.id);
    assert.deepEqual(naLoja.esgotados, ['M|Preto']);
    assert.equal(naLoja.estoque, undefined, 'a loja não pode ver as quantidades');
    assert.equal(naLoja.alertaEstoque, undefined);

    const painel = (await navegador.requisitar('api/admin/painel.php')).dados;
    const alertasDoProduto = painel.alertasEstoque.filter((alerta) => alerta.idProduto === produto.id);
    assert.deepEqual(alertasDoProduto.map((alerta) => [alerta.tamanho, alerta.quantidade]), [['M', 0]]);
  } finally {
    await excluirProdutoDeTeste(navegador, produto.id);
  }
});

test('salvar o produto não grava por cima de uma mudança de estoque feita no meio-tempo', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const produto = await criarProdutoComEstoque(navegador, { 'P|Preto': 5, 'M|Preto': 3 });
  try {
    // Outra pessoa muda o P para 4 (como uma venda faria)
    rodarSql(`UPDATE estoque SET quantidade = 4 WHERE produto_id = '${produto.id}' AND tamanho = 'P'`);
    const base = { ...produto, id: produto.id };

    // Mexer só no M, a partir do que o formulário viu, não desfaz a mudança do P
    const soNoM = await navegador.requisitar('api/admin/produtos.php', {
      metodo: 'POST',
      corpo: { ...base, estoque: { 'P|Preto': 5, 'M|Preto': 10 }, estoqueVisto: { 'P|Preto': 5, 'M|Preto': 3 } },
    });
    assert.equal(soNoM.status, 200, JSON.stringify(soNoM.dados));
    assert.deepEqual(soNoM.dados.produto.estoque, { 'P|Preto': 4, 'M|Preto': 10 });

    // Mexer no P com o número velho é recusado
    const conflito = await navegador.requisitar('api/admin/produtos.php', {
      metodo: 'POST',
      corpo: { ...base, estoque: { 'P|Preto': 8, 'M|Preto': 10 }, estoqueVisto: { 'P|Preto': 5, 'M|Preto': 10 } },
    });
    assert.equal(conflito.status, 409);
    assert.match(conflito.dados.erro, /mudou enquanto você editava/);

    // Inativar (sem mandar estoque) não mexe nas quantidades
    const inativado = await navegador.requisitar('api/admin/produtos.php', { metodo: 'POST', corpo: { ...base, ativo: false, estoque: undefined } });
    assert.deepEqual(inativado.dados.produto.estoque, { 'P|Preto': 4, 'M|Preto': 10 });

    // Tirar o tamanho M apaga a variação do estoque
    const semM = await navegador.requisitar('api/admin/produtos.php', {
      metodo: 'POST',
      corpo: { ...base, tamanhos: ['P'], estoque: { 'P|Preto': 4 }, estoqueVisto: { 'P|Preto': 4 } },
    });
    assert.deepEqual(semM.dados.produto.estoque, { 'P|Preto': 4 });
    assert.equal(rodarSql(`SELECT COUNT(*) FROM estoque WHERE produto_id = '${produto.id}'`).trim(), '1');

    const invalido = await navegador.requisitar('api/admin/produtos.php', {
      metodo: 'POST',
      corpo: { ...base, tamanhos: ['P'], estoque: { 'P|Preto': -1 }, estoqueVisto: { 'P|Preto': 4 } },
    });
    assert.equal(invalido.status, 422);
  } finally {
    await excluirProdutoDeTeste(navegador, produto.id);
  }
  assert.equal(rodarSql(`SELECT COUNT(*) FROM estoque WHERE produto_id = '${produto.id}'`).trim(), '0', 'excluir o produto apaga o estoque');
});

// ---------- Pedidos do site e vendas no balcão ----------

const USUARIO_FUNCIONARIO_VENDAS = 'teste-func-vendas';

/** A cliente (sem login) finaliza o pedido pelo site, como a página de contato faz. */
async function enviarPedidoDoSite(corpo, cabecalhos = {}) {
  const resposta = await fetch(`${ENDERECO_BASE}/api/pedidos.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, dados: await resposta.json() };
}

function contatoLigado() {
  return rodarSql('SELECT id FROM contatos WHERE ativo = 1 ORDER BY ordem LIMIT 1').trim();
}

/** Apaga os pedidos de teste que usaram o produto (os itens vão junto). */
function apagarPedidosDoProduto(idProduto) {
  rodarSql(`DELETE pedidos FROM pedidos JOIN pedido_itens ON pedido_itens.pedido_id = pedidos.id WHERE pedido_itens.produto_id = '${idProduto}'`);
}

function quantidadeEmEstoque(idProduto, tamanho) {
  return Number(rodarSql(`SELECT quantidade FROM estoque WHERE produto_id = '${idProduto}' AND tamanho = '${tamanho}'`).trim());
}

test('pedido do site: preço do banco, esgotado recusado e pedido mínimo conferido', async () => {
  rodarSql("UPDATE pedidos SET ip = NULL WHERE origem = 'site'");
  const dono = criarNavegador();
  await dono.entrar();
  const produto = await criarProdutoComEstoque(dono, { 'P|Preto': 5, 'M|Preto': 0 }, { preco: 100 });
  try {
    const idContato = contatoLigado();
    const itemP = { idProduto: produto.id, tamanho: 'P', cor: 'Preto', quantidade: 5, preco: 1 };

    const pedido = await enviarPedidoDoSite({ itens: [itemP], observacoes: 'Entregar sexta', idContato });
    assert.equal(pedido.status, 201, JSON.stringify(pedido.dados));
    const gravado = rodarSql(`SELECT total, situacao, origem, observacoes FROM pedidos WHERE id = ${pedido.dados.numero}`).trim().split('\t');
    assert.deepEqual(gravado, ['500.00', 'pendente', 'site', 'Entregar sexta'], 'o preço enviado pelo navegador é ignorado');
    assert.equal(quantidadeEmEstoque(produto.id, 'P'), 5, 'pedido pendente não baixa o estoque');

    const esgotado = await enviarPedidoDoSite({ itens: [{ ...itemP, tamanho: 'M' }], idContato });
    assert.equal(esgotado.status, 409);
    assert.match(esgotado.dados.erro, /esgotou/);

    const abaixoDoMinimo = await enviarPedidoDoSite({ itens: [{ ...itemP, quantidade: 1 }], idContato });
    assert.equal(abaixoDoMinimo.status, 422);

    const semAtendente = await enviarPedidoDoSite({ itens: [itemP], idContato: 'contato-inventado' });
    assert.equal(semAtendente.status, 409);

    const outroSite = await enviarPedidoDoSite({ itens: [itemP], idContato }, { Origin: 'https://site-malicioso.example' });
    assert.equal(outroSite.status, 403);

    const naoJson = await fetch(`${ENDERECO_BASE}/api/pedidos.php`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(naoJson.status, 415);

    // Limite de pedidos por hora vindo do mesmo endereço
    const ipDoTeste = rodarSql(`SELECT ip FROM pedidos WHERE id = ${pedido.dados.numero}`).trim();
    for (let repeticao = 0; repeticao < 9; repeticao++) {
      rodarSql(`INSERT INTO pedidos (origem, total, ip) VALUES ('site', 0, '${ipDoTeste}')`);
    }
    assert.equal((await enviarPedidoDoSite({ itens: [itemP], idContato })).status, 429);
  } finally {
    // Os pedidos de mentira do teste de limite não têm itens
    rodarSql("DELETE pedidos FROM pedidos LEFT JOIN pedido_itens ON pedido_itens.pedido_id = pedidos.id WHERE pedidos.origem = 'site' AND pedidos.total = 0 AND pedido_itens.id IS NULL");
    rodarSql("UPDATE pedidos SET ip = NULL WHERE origem = 'site'");
    apagarPedidosDoProduto(produto.id);
    await excluirProdutoDeTeste(dono, produto.id);
  }
});

test('marcar como vendido baixa o estoque; sem peça suficiente nada muda; cancelar devolve (só o dono)', async () => {
  rodarSql("UPDATE pedidos SET ip = NULL WHERE origem = 'site'");
  const dono = criarNavegador();
  await dono.entrar();
  criarUsuarioDeTeste(USUARIO_FUNCIONARIO_VENDAS, 'funcionario');
  const funcionario = criarNavegador();
  await funcionario.entrar(USUARIO_FUNCIONARIO_VENDAS, SENHA_TESTE);
  const produto = await criarProdutoComEstoque(dono, { 'P|Preto': 5, 'M|Preto': 0 }, { preco: 100 });
  try {
    const idContato = contatoLigado();
    const itemP = { idProduto: produto.id, tamanho: 'P', cor: 'Preto', quantidade: 5 };
    const primeiro = (await enviarPedidoDoSite({ itens: [itemP], idContato })).dados.numero;
    const segundo = (await enviarPedidoDoSite({ itens: [itemP], idContato })).dados.numero;

    const pendentes = await funcionario.requisitar('api/admin/pedidos.php?situacao=pendente');
    assert.ok(pendentes.dados.pedidos.some((pedido) => pedido.id === primeiro));
    assert.ok(pendentes.dados.pendentes >= 2);

    const semForma = await funcionario.requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'vender', id: primeiro } });
    assert.equal(semForma.status, 422);

    const vendido = await funcionario.requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'vender', id: primeiro, formaPagamento: 'pix' } });
    assert.equal(vendido.status, 200, JSON.stringify(vendido.dados));
    assert.equal(vendido.dados.pedido.situacao, 'vendido');
    assert.equal(vendido.dados.pedido.formaPagamento, 'pix');
    assert.equal(vendido.dados.pedido.finalizadoPor, `Usuário ${USUARIO_FUNCIONARIO_VENDAS}`);
    assert.equal(quantidadeEmEstoque(produto.id, 'P'), 0);

    const deNovo = await funcionario.requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'vender', id: primeiro, formaPagamento: 'pix' } });
    assert.equal(deNovo.status, 409);

    // O segundo pedido pede 5 peças, mas o estoque zerou
    const semPeca = await funcionario.requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'vender', id: segundo, formaPagamento: 'dinheiro' } });
    assert.equal(semPeca.status, 409);
    assert.match(semPeca.dados.erro, /Falta peça no estoque: Produto Estoque Teste \(P, Preto\): pedido 5, em estoque 0/);
    assert.equal(rodarSql(`SELECT situacao FROM pedidos WHERE id = ${segundo}`).trim(), 'pendente');

    const funcionarioCancelaVenda = await funcionario.requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'cancelar', id: primeiro } });
    assert.equal(funcionarioCancelaVenda.status, 403);
    const donoCancelaVenda = await dono.requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'cancelar', id: primeiro } });
    assert.equal(donoCancelaVenda.status, 200);
    assert.equal(quantidadeEmEstoque(produto.id, 'P'), 5, 'cancelar a venda devolve as peças');

    const cancelaPendente = await funcionario.requisitar('api/admin/pedidos.php', { metodo: 'POST', corpo: { acao: 'cancelar', id: segundo } });
    assert.equal(cancelaPendente.status, 200);
    assert.equal(quantidadeEmEstoque(produto.id, 'P'), 5, 'cancelar um pendente não mexe no estoque');
    const movimentos = rodarSql(`SELECT motivo, variacao FROM movimentos_estoque WHERE produto_id = '${produto.id}' AND pedido_id IS NOT NULL ORDER BY id`).trim();
    assert.equal(movimentos, 'venda\t-5\ncancelamento\t5');
  } finally {
    apagarPedidosDoProduto(produto.id);
    await excluirProdutoDeTeste(dono, produto.id);
  }
});

test('venda no balcão nasce vendida e baixa o estoque; sem peça, nenhuma venda é gravada', async () => {
  const funcionario = criarNavegador();
  criarUsuarioDeTeste(USUARIO_FUNCIONARIO_VENDAS, 'funcionario');
  await funcionario.entrar(USUARIO_FUNCIONARIO_VENDAS, SENHA_TESTE);
  const dono = criarNavegador();
  await dono.entrar();
  const produto = await criarProdutoComEstoque(dono, { 'P|Preto': 3, 'M|Preto': 1 }, { preco: 40 });
  try {
    const venda = await funcionario.requisitar('api/admin/pedidos.php', {
      metodo: 'POST',
      corpo: {
        acao: 'balcao',
        formaPagamento: 'credito',
        itens: [
          { idProduto: produto.id, tamanho: 'P', cor: 'Preto', quantidade: 2 },
          { idProduto: produto.id, tamanho: 'M', cor: 'Preto', quantidade: 1 },
        ],
      },
    });
    assert.equal(venda.status, 200, JSON.stringify(venda.dados));
    assert.deepEqual(
      { origem: venda.dados.pedido.origem, situacao: venda.dados.pedido.situacao, total: venda.dados.pedido.total, itens: venda.dados.pedido.itens.length },
      { origem: 'balcao', situacao: 'vendido', total: 120, itens: 2 },
    );
    assert.equal(quantidadeEmEstoque(produto.id, 'P'), 1);
    assert.equal(quantidadeEmEstoque(produto.id, 'M'), 0);

    const totalDeVendasAntes = rodarSql("SELECT COUNT(*) FROM pedidos WHERE origem = 'balcao'").trim();
    const semPeca = await funcionario.requisitar('api/admin/pedidos.php', {
      metodo: 'POST',
      corpo: { acao: 'balcao', formaPagamento: 'pix', itens: [{ idProduto: produto.id, tamanho: 'P', cor: 'Preto', quantidade: 2 }] },
    });
    assert.equal(semPeca.status, 409);
    assert.equal(rodarSql("SELECT COUNT(*) FROM pedidos WHERE origem = 'balcao'").trim(), totalDeVendasAntes);
    assert.equal(quantidadeEmEstoque(produto.id, 'P'), 1);

    const vendidos = await funcionario.requisitar('api/admin/pedidos.php?situacao=vendido');
    assert.ok(vendidos.dados.pedidos.some((pedido) => pedido.id === venda.dados.pedido.id));
  } finally {
    apagarPedidosDoProduto(produto.id);
    await excluirProdutoDeTeste(dono, produto.id);
    rodarSql(`UPDATE usuarios SET ativo = 0 WHERE usuario = '${USUARIO_FUNCIONARIO_VENDAS}'`);
  }
});
