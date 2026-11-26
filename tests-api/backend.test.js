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
// Senha do .htpasswd do ambiente local (docker/dev/.htpasswd)
const SENHA_DO_SERVIDOR = `Basic ${Buffer.from('teste:teste-local').toString('base64')}`;
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
function criarNavegador({ comSenhaDoServidor = true } = {}) {
  let cookieDeSessao = '';
  let tokenCsrf = '';

  async function requisitar(caminho, { metodo = 'GET', corpo, enviarCsrf = true, cabecalhos = {} } = {}) {
    const cabecalhosFinais = { ...cabecalhos };
    if (comSenhaDoServidor) cabecalhosFinais.Authorization = SENHA_DO_SERVIDOR;
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
  const navegador = criarNavegador({ comSenhaDoServidor: false });
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

test('login e API do painel exigem a senha do servidor (.htpasswd)', async () => {
  const semSenhaDoServidor = criarNavegador({ comSenhaDoServidor: false });
  assert.equal((await semSenhaDoServidor.requisitar('api/sessao.php')).status, 401);
  assert.equal((await semSenhaDoServidor.requisitar('api/admin/painel.php')).status, 401);
  assert.equal((await semSenhaDoServidor.requisitar('admin.html')).status, 401);
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
  const loja = criarNavegador({ comSenhaDoServidor: false });
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
  ];
  for (const [produto, mensagemEsperada] of casos) {
    const { status, dados } = await navegador.requisitar('api/admin/produtos.php', { metodo: 'POST', corpo: produto });
    assert.equal(status, 422, JSON.stringify(produto));
    assert.match(dados.erro, mensagemEsperada);
  }
});

test('desligar um atendente tira ele do catálogo público na hora', async () => {
  const navegador = criarNavegador();
  await navegador.entrar();
  const loja = criarNavegador({ comSenhaDoServidor: false });
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

  const loja = criarNavegador({ comSenhaDoServidor: false });
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
  const loja = criarNavegador({ comSenhaDoServidor: false });
  assert.equal((await loja.requisitar(`fotos/${'0'.repeat(32)}.jpg`)).status, 404);
  assert.equal((await loja.requisitar('api/foto.php?arquivo=../config/vivale.php')).status, 404);
});

// ---------- Arquivos protegidos ----------

test('peças internas e arquivos de desenvolvimento ficam bloqueados', async () => {
  const loja = criarNavegador({ comSenhaDoServidor: false });
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
