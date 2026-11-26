/**
 * Painel do Vendedor: CRUD de produtos, contatos do WhatsApp, configurações da loja e equipe.
 *
 * O dono vê tudo; o funcionário cadastra, edita e inativa produtos e troca a própria senha.
 *
 * Tudo é salvo no servidor (api/admin/*) e vale para as clientes na hora.
 * O login é conferido no servidor; o navegador guarda só uma cópia para desenhar as telas.
 */
(function (raiz) {
  'use strict';

  const { armazenamento, utilidades, componentes, imagem, contatos, api } = raiz.Loja;
  const { formatarMoeda, escaparHtml, lerValorMonetario } = utilidades;

  const elementos = {};
  let idProdutoEmEdicao = null;
  let fotoAtual = '';
  // Quem está logado: o papel ("dono" ou "funcionario") decide o que aparece no painel
  let usuarioLogado = null;
  let idFuncionarioEmEdicao = null;

  function iniciar() {
    elementos.telaLogin = document.getElementById('tela-login');
    elementos.painel = document.getElementById('painel-admin');
    elementos.listaProdutos = document.getElementById('lista-produtos-admin');
    elementos.totalProdutos = document.getElementById('total-produtos');
    elementos.janelaProduto = document.getElementById('janela-formulario-produto');
    elementos.formularioProduto = document.getElementById('formulario-produto');
    elementos.tituloFormulario = document.getElementById('titulo-formulario-produto');
    elementos.erroProduto = document.getElementById('erro-produto');
    elementos.campoNome = document.getElementById('produto-nome');
    elementos.campoDescricao = document.getElementById('produto-descricao');
    elementos.campoCategoria = document.getElementById('produto-categoria');
    elementos.listaCategorias = document.getElementById('lista-categorias');
    elementos.campoPreco = document.getElementById('produto-preco');
    elementos.campoFotoArquivo = document.getElementById('produto-foto-arquivo');
    elementos.campoFotoUrl = document.getElementById('produto-foto-url');
    elementos.previaFoto = document.getElementById('produto-foto-previa');
    elementos.botaoRemoverFoto = document.getElementById('botao-remover-foto');
    elementos.caixasTamanhos = document.querySelectorAll('#produto-tamanhos input[type="checkbox"]');
    elementos.caixaTamanhoUnico = document.getElementById('produto-tamanho-unico');
    elementos.caixaTamanhoUnico.addEventListener('change', aplicarTamanhoUnico);
    elementos.campoCores = document.getElementById('produto-cores');
    elementos.campoAtivo = document.getElementById('produto-ativo');

    criarBotoesVerSenha();
    document.getElementById('formulario-login').addEventListener('submit', entrar);
    document.getElementById('formulario-codigo').addEventListener('submit', confirmarCodigoDoLogin);
    document.getElementById('botao-voltar-login').addEventListener('click', () => mostrarLogin());
    configurarDoisFatores();
    document.getElementById('botao-sair').addEventListener('click', sair);
    document.querySelectorAll('.aba').forEach((aba) => aba.addEventListener('click', trocarAba));

    document.getElementById('botao-novo-produto').addEventListener('click', () => abrirFormulario(null));
    elementos.listaProdutos.addEventListener('click', tratarAcaoProduto);
    elementos.formularioProduto.addEventListener('submit', salvarFormularioProduto);
    elementos.campoFotoArquivo.addEventListener('change', tratarUploadFoto);
    elementos.campoFotoUrl.addEventListener('input', () => definirFoto(elementos.campoFotoUrl.value.trim()));
    elementos.botaoRemoverFoto.addEventListener('click', () => {
      elementos.campoFotoArquivo.value = '';
      elementos.campoFotoUrl.value = '';
      definirFoto('');
    });
    componentes.configurarJanela(elementos.janelaProduto);

    elementos.listaContatos = document.getElementById('lista-contatos-admin');
    elementos.erroContatos = document.getElementById('erro-contatos');
    elementos.listaContatos.addEventListener('click', tratarAcaoContato);
    document.getElementById('botao-adicionar-contato').addEventListener('click', adicionarContatoVazio);
    document.getElementById('formulario-contatos').addEventListener('submit', salvarContatos);
    document.getElementById('formulario-configuracao').addEventListener('submit', salvarConfiguracoes);
    document.getElementById('formulario-senha').addEventListener('submit', trocarSenha);
    document.getElementById('botao-exportar').addEventListener('click', exportarCatalogo);
    document.getElementById('botao-baixar-backup').addEventListener('click', baixarBackupCompleto);

    elementos.listaEquipe = document.getElementById('lista-equipe');
    elementos.janelaSenhaFuncionario = document.getElementById('janela-senha-funcionario');
    elementos.listaEquipe.addEventListener('click', tratarAcaoFuncionario);
    document.getElementById('formulario-novo-funcionario').addEventListener('submit', cadastrarFuncionario);
    document.getElementById('formulario-senha-funcionario').addEventListener('submit', salvarSenhaFuncionario);
    componentes.configurarJanela(elementos.janelaSenhaFuncionario);

    verificarSessao();
  }

  // ---------- Login ----------

  async function verificarSessao() {
    try {
      const usuario = await api.obterSessao();
      if (usuario) {
        await abrirPainel();
      } else {
        mostrarLogin();
      }
    } catch (erro) {
      mostrarLogin(erro.message);
    }
  }

  const ICONE_OLHO = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" stroke-linejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>`;
  const ICONE_OLHO_RISCADO = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.6 7-10 7c-2 0-3.7-.7-5.1-1.6" stroke-linecap="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" stroke-linecap="round" />
    </svg>`;

  /** Coloca um botão de olho em cada campo de senha, para conferir o que foi digitado. */
  function criarBotoesVerSenha() {
    document.querySelectorAll('input[type="password"]').forEach((campoSenha) => {
      const envoltorio = document.createElement('div');
      envoltorio.className = 'campo-senha';
      campoSenha.replaceWith(envoltorio);
      envoltorio.append(campoSenha);

      const botaoVer = document.createElement('button');
      botaoVer.type = 'button';
      botaoVer.className = 'botao-ver-senha';
      envoltorio.append(botaoVer);
      definirSenhaVisivel(campoSenha, botaoVer, false);

      botaoVer.addEventListener('click', () => {
        definirSenhaVisivel(campoSenha, botaoVer, campoSenha.type === 'password');
        campoSenha.focus();
      });
    });
  }

  function definirSenhaVisivel(campoSenha, botaoVer, visivel) {
    campoSenha.type = visivel ? 'text' : 'password';
    botaoVer.innerHTML = visivel ? ICONE_OLHO_RISCADO : ICONE_OLHO;
    botaoVer.setAttribute('aria-label', visivel ? 'Ocultar senha' : 'Mostrar senha');
    botaoVer.setAttribute('aria-pressed', String(visivel));
  }

  /** Volta a esconder todas as senhas (depois de entrar, sair ou trocar a senha). */
  function esconderSenhas() {
    document.querySelectorAll('.campo-senha').forEach((envoltorio) => {
      definirSenhaVisivel(envoltorio.querySelector('input'), envoltorio.querySelector('.botao-ver-senha'), false);
    });
  }

  function mostrarLogin(mensagem = '') {
    elementos.painel.classList.add('oculto');
    elementos.telaLogin.classList.remove('oculto');
    document.getElementById('formulario-login').classList.remove('oculto');
    document.getElementById('formulario-codigo').classList.add('oculto');
    const elementoErro = document.getElementById('erro-login');
    elementoErro.textContent = mensagem;
    elementoErro.classList.toggle('oculto', !mensagem);
    document.getElementById('campo-usuario').focus();
  }

  async function entrar(evento) {
    evento.preventDefault();
    const campoUsuario = document.getElementById('campo-usuario');
    const campoSenha = document.getElementById('campo-senha');
    const botaoEntrar = document.getElementById('botao-entrar');
    if (!campoUsuario.value.trim() || !campoSenha.value) {
      mostrarLogin('Informe o usuário e a senha.');
      return;
    }

    botaoEntrar.disabled = true;
    try {
      const { precisaCodigo } = await api.entrar(campoUsuario.value.trim(), campoSenha.value);
      campoSenha.value = '';
      esconderSenhas();
      if (precisaCodigo) {
        mostrarEtapaDoCodigo();
        return;
      }
      await abrirPainel();
    } catch (erro) {
      mostrarLogin(erro.message);
      campoSenha.select();
    } finally {
      botaoEntrar.disabled = false;
    }
  }

  async function sair() {
    try {
      await api.sair();
    } catch (erro) {
      // Mesmo sem resposta do servidor, a tela volta para o login
    }
    mostrarLogin();
  }

  /** Busca tudo no servidor, guarda a cópia no navegador e mostra o painel. */
  async function abrirPainel() {
    const dadosDoPainel = await api.carregarPainel();
    armazenamento.aplicarCatalogoDoServidor(dadosDoPainel);
    usuarioLogado = dadosDoPainel.usuario;
    elementos.telaLogin.classList.add('oculto');
    elementos.painel.classList.remove('oculto');
    aplicarPermissoes();
    selecionarAba('aba-produtos');
    renderizarProdutos();
    preencherConfiguracoes();
    if (ehDono()) {
      carregarEquipe();
      mostrarSituacaoDoBackup(dadosDoPainel.backup);
    }
    document.getElementById('aviso-dois-fatores').classList.toggle('oculto', !ehDono() || usuarioLogado.doisFatores);
    carregarDoisFatores();
  }

  function ehDono() {
    return Boolean(usuarioLogado) && usuarioLogado.papel === 'dono';
  }

  /** Mostra as partes marcadas com data-somente-dono só para o dono (o servidor também confere). */
  function aplicarPermissoes() {
    document.querySelectorAll('[data-somente-dono]').forEach((elemento) => {
      elemento.classList.toggle('oculto', !ehDono());
    });
  }

  /** Sessão expirada volta para o login; outros erros só mostram a mensagem. */
  function tratarErroDoServidor(erro, mostrarMensagem) {
    if (erro.codigoHttp === 401) {
      mostrarLogin('Sua sessão expirou. Entre de novo.');
      return;
    }
    mostrarMensagem(erro.message);
  }

  function trocarAba(evento) {
    selecionarAba(evento.currentTarget.dataset.aba);
  }

  function selecionarAba(idAba) {
    document.querySelectorAll('.aba').forEach((aba) => {
      const selecionada = aba.dataset.aba === idAba;
      aba.setAttribute('aria-selected', String(selecionada));
      document.getElementById(aba.dataset.aba).classList.toggle('oculto', !selecionada);
    });
  }

  // ---------- Lista de produtos ----------

  function renderizarProdutos() {
    const produtos = armazenamento.obterProdutos();
    elementos.totalProdutos.textContent = String(produtos.length);

    if (produtos.length === 0) {
      elementos.listaProdutos.innerHTML =
        '<p class="estado-vazio">Nenhum produto cadastrado. Clique em “Novo produto”.</p>';
      return;
    }

    elementos.listaProdutos.innerHTML = produtos.map(montarHtmlLinhaProduto).join('');
    elementos.listaProdutos.querySelectorAll('img').forEach((elementoImagem, posicao) => {
      componentes.aplicarFotoComReserva(elementoImagem, produtos[posicao]);
    });
  }

  function montarHtmlLinhaProduto(produto) {
    const ativo = produto.ativo !== false;
    return `
      <article class="linha-produto-admin ${ativo ? '' : 'inativo'}" data-id="${escaparHtml(produto.id)}">
        <img alt="" />
        <div>
          <h3>${escaparHtml(produto.nome)}${ativo ? '' : '<span class="etiqueta">Inativo</span>'}</h3>
          <p>${escaparHtml(produto.categoria)} · <strong>${formatarMoeda(produto.preco)}</strong></p>
          <p>${escaparHtml(produto.tamanhos.map(utilidades.rotularTamanho).join(', '))} · ${escaparHtml(produto.cores.join(', '))}</p>
          <div class="acoes-produto-admin">
            <button class="botao botao-contorno botao-pequeno" type="button" data-acao="editar">Editar</button>
            <button class="botao botao-contorno botao-pequeno" type="button" data-acao="alternar">${ativo ? 'Inativar' : 'Ativar'}</button>
            ${ehDono() ? '<button class="botao botao-perigo botao-pequeno" type="button" data-acao="excluir">Excluir</button>' : ''}
          </div>
        </div>
      </article>`;
  }

  async function tratarAcaoProduto(evento) {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao) return;
    const idProduto = botao.closest('[data-id]').dataset.id;
    const produto = armazenamento.obterProdutoPorId(idProduto);
    if (!produto) return;

    if (botao.dataset.acao === 'editar') {
      abrirFormulario(produto);
    } else if (botao.dataset.acao === 'alternar') {
      botao.disabled = true;
      const salvou = await salvarComTratamento({ ...produto, ativo: produto.ativo === false });
      botao.disabled = false;
      if (salvou) {
        componentes.mostrarToast(produto.ativo === false ? 'Produto ativado' : 'Produto inativado');
      }
    } else if (botao.dataset.acao === 'excluir') {
      if (!confirm(`Excluir "${produto.nome}" definitivamente?`)) return;
      botao.disabled = true;
      try {
        await api.excluirProduto(idProduto);
        armazenamento.removerProduto(idProduto);
        renderizarProdutos();
        componentes.mostrarToast('Produto excluído');
      } catch (erro) {
        botao.disabled = false;
        tratarErroDoServidor(erro, (mensagem) => alert(mensagem));
      }
    }
  }

  // ---------- Formulário de produto ----------

  function abrirFormulario(produto) {
    idProdutoEmEdicao = produto ? produto.id : null;
    elementos.formularioProduto.reset();
    elementos.erroProduto.classList.add('oculto');
    elementos.tituloFormulario.textContent = produto ? 'Editar produto' : 'Novo produto';

    // Sugestões de categorias já existentes
    const categorias = [...new Set(armazenamento.obterProdutos().map((item) => item.categoria))];
    elementos.listaCategorias.innerHTML = categorias
      .map((categoria) => `<option value="${escaparHtml(categoria)}"></option>`)
      .join('');

    elementos.campoNome.value = produto ? produto.nome : '';
    elementos.campoDescricao.value = produto ? produto.descricao || '' : '';
    elementos.campoCategoria.value = produto ? produto.categoria : '';
    elementos.campoPreco.value = produto ? String(produto.preco).replace('.', ',') : '';
    elementos.campoCores.value = produto ? produto.cores.join(', ') : '';
    elementos.campoAtivo.checked = produto ? produto.ativo !== false : true;
    elementos.caixasTamanhos.forEach((caixa) => {
      // Produto novo começa com P, M, G e GG marcados
      caixa.checked = produto ? produto.tamanhos.includes(caixa.value) : caixa !== elementos.caixaTamanhoUnico;
    });
    aplicarTamanhoUnico();

    const fotoDoProduto = produto ? produto.foto : '';
    elementos.campoFotoUrl.value = fotoDoProduto.startsWith('data:') ? '' : fotoDoProduto;
    definirFoto(fotoDoProduto);

    elementos.janelaProduto.showModal();
    elementos.campoNome.focus();
  }

  function definirFoto(endereco) {
    fotoAtual = endereco;
    elementos.previaFoto.classList.toggle('oculto', !endereco);
    elementos.botaoRemoverFoto.classList.toggle('oculto', !endereco);
    if (endereco) elementos.previaFoto.src = endereco;
  }

  /** Reduz a foto escolhida, envia ao servidor e mostra a prévia já pelo endereço definitivo. */
  async function tratarUploadFoto() {
    const arquivo = elementos.campoFotoArquivo.files[0];
    if (!arquivo) return;
    const avisoEnviando = document.getElementById('produto-foto-enviando');
    const botaoSalvar = elementos.formularioProduto.querySelector('button[type="submit"]');
    avisoEnviando.classList.remove('oculto');
    botaoSalvar.disabled = true;
    elementos.erroProduto.classList.add('oculto');
    try {
      const fotoReduzida = await imagem.reduzirParaEnvio(arquivo);
      elementos.campoFotoUrl.value = '';
      definirFoto(await api.enviarFoto(fotoReduzida));
    } catch (erro) {
      elementos.campoFotoArquivo.value = '';
      tratarErroDoServidor(erro, mostrarErroProduto);
    } finally {
      avisoEnviando.classList.add('oculto');
      botaoSalvar.disabled = false;
    }
  }

  function mostrarErroProduto(mensagem) {
    elementos.erroProduto.textContent = mensagem;
    elementos.erroProduto.classList.remove('oculto');
  }

  /** Lê o formulário e devolve { produto } ou { erro }. */
  /** Tamanho único marcado: desmarca e trava P, M, G e GG (a peça só tem um tamanho). */
  function aplicarTamanhoUnico() {
    const ehTamanhoUnico = elementos.caixaTamanhoUnico.checked;
    elementos.caixasTamanhos.forEach((caixa) => {
      if (caixa === elementos.caixaTamanhoUnico) return;
      if (ehTamanhoUnico) caixa.checked = false;
      caixa.disabled = ehTamanhoUnico;
    });
  }

  function lerFormularioProduto() {
    const nome = elementos.campoNome.value.trim();
    const descricao = elementos.campoDescricao.value.trim();
    const categoria = elementos.campoCategoria.value.trim();
    const preco = lerValorMonetario(elementos.campoPreco.value);
    const tamanhos = [...elementos.caixasTamanhos]
      .filter((caixa) => caixa.checked)
      .map((caixa) => caixa.value);
    const cores = [
      ...new Set(
        elementos.campoCores.value
          .split(',')
          .map((cor) => cor.trim())
          .filter(Boolean),
      ),
    ];

    if (!nome) return { erro: 'Informe o nome do produto.' };
    if (!categoria) return { erro: 'Informe a categoria.' };
    if (!Number.isFinite(preco) || preco <= 0) return { erro: 'Informe um preço válido (ex.: 65,00).' };
    if (tamanhos.length === 0) return { erro: 'Selecione pelo menos um tamanho.' };
    if (cores.length === 0) return { erro: 'Informe pelo menos uma cor.' };

    return {
      produto: {
        // Produto novo vai sem id: o servidor cria o identificador
        id: idProdutoEmEdicao,
        nome,
        descricao,
        categoria,
        preco: Math.round(preco * 100) / 100,
        foto: fotoAtual,
        tamanhos,
        cores,
        ativo: elementos.campoAtivo.checked,
      },
    };
  }

  async function salvarFormularioProduto(evento) {
    evento.preventDefault();
    const resultado = lerFormularioProduto();
    if (resultado.erro) {
      mostrarErroProduto(resultado.erro);
      return;
    }
    const botaoSalvar = elementos.formularioProduto.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    const salvou = await salvarComTratamento(resultado.produto);
    botaoSalvar.disabled = false;
    if (salvou) {
      elementos.janelaProduto.close();
      componentes.mostrarToast(idProdutoEmEdicao ? 'Produto atualizado' : 'Produto cadastrado');
    }
  }

  /** Salva o produto no servidor e atualiza a lista. Retorna true se deu certo. */
  async function salvarComTratamento(produto) {
    try {
      armazenamento.salvarProduto(await api.salvarProduto(produto));
      renderizarProdutos();
      return true;
    } catch (erro) {
      // Com o formulário aberto o erro aparece nele; na lista, só um alerta fica visível
      tratarErroDoServidor(erro, (mensagem) => {
        if (elementos.janelaProduto.open) {
          mostrarErroProduto(mensagem);
        } else {
          alert(mensagem);
        }
      });
      return false;
    }
  }

  // ---------- Contatos do WhatsApp ----------

  /** Desenha uma linha editável (nome + número + liga/desliga + remover) para cada contato salvo. */
  function preencherContatos() {
    const { contatosWhatsApp } = armazenamento.obterConfiguracao();
    elementos.listaContatos.innerHTML = '';
    contatosWhatsApp.forEach(adicionarLinhaContato);
    elementos.erroContatos.classList.add('oculto');
  }

  function adicionarLinhaContato(contato) {
    const idContato = contato.id || contatos.gerarIdContato();
    const idSeguro = escaparHtml(idContato);
    const linha = document.createElement('div');
    linha.className = 'linha-contato-admin';
    linha.dataset.idContato = idContato;
    linha.innerHTML = `
      <div class="campo">
        <label for="${idSeguro}-nome">Nome</label>
        <input type="text" id="${idSeguro}-nome" data-campo="nome" maxlength="40" placeholder="Ex.: Vendas" />
      </div>
      <div class="campo">
        <label for="${idSeguro}-numero">WhatsApp</label>
        <input type="tel" id="${idSeguro}-numero" data-campo="numero" inputmode="tel" placeholder="(21) 99999-9999" />
      </div>
      <label class="interruptor">
        <input type="checkbox" role="switch" data-campo="ativo" />
        <span class="interruptor-trilho" aria-hidden="true"></span>
        <span class="interruptor-texto"></span>
      </label>
      <button class="botao botao-perigo botao-pequeno" type="button" data-acao="remover-contato">Remover</button>`;
    // Valores atribuídos via propriedade: dispensa escapar o texto digitado
    linha.querySelector('[data-campo="nome"]').value = contato.nome || '';
    linha.querySelector('[data-campo="numero"]').value = contato.numero
      ? contatos.formatarTelefone(contato.numero)
      : '';
    const campoAtivo = linha.querySelector('[data-campo="ativo"]');
    campoAtivo.checked = contato.ativo !== false;
    campoAtivo.addEventListener('change', () => atualizarTextoInterruptor(linha));
    atualizarTextoInterruptor(linha);
    elementos.listaContatos.appendChild(linha);
    return linha;
  }

  /** Mostra "Ligado"/"Desligado" ao lado do interruptor e deixa esmaecida a linha do contato desligado. */
  function atualizarTextoInterruptor(linha) {
    const estaLigado = linha.querySelector('[data-campo="ativo"]').checked;
    linha.querySelector('.interruptor-texto').textContent = estaLigado ? 'Ligado' : 'Desligado';
    linha.classList.toggle('contato-desligado', !estaLigado);
  }

  function adicionarContatoVazio() {
    const novaLinha = adicionarLinhaContato({ nome: '', numero: '' });
    novaLinha.querySelector('[data-campo="nome"]').focus();
  }

  function tratarAcaoContato(evento) {
    const botao = evento.target.closest('button[data-acao="remover-contato"]');
    if (!botao) return;
    const linha = botao.closest('.linha-contato-admin');
    const nomeContato = linha.querySelector('[data-campo="nome"]').value.trim() || 'este contato';
    if (!confirm(`Remover ${nomeContato}? A alteração só vale depois de salvar.`)) return;
    linha.remove();
  }

  async function salvarContatos(evento) {
    evento.preventDefault();
    const contatosDigitados = [...elementos.listaContatos.querySelectorAll('.linha-contato-admin')].map(
      (linha) => ({
        id: linha.dataset.idContato,
        nome: linha.querySelector('[data-campo="nome"]').value,
        numero: linha.querySelector('[data-campo="numero"]').value,
        ativo: linha.querySelector('[data-campo="ativo"]').checked,
      }),
    );

    const resultado = contatos.validarContatos(contatosDigitados);
    mostrarErroContatos(resultado.erro || '');
    if (resultado.erro) return;

    const botaoSalvar = evento.target.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    try {
      const contatosSalvos = await api.salvarContatos(resultado.contatos);
      armazenamento.salvarConfiguracao({ contatosWhatsApp: contatosSalvos, origemServidor: true });
      preencherContatos();
      componentes.mostrarToast('Contatos salvos');
    } catch (erro) {
      tratarErroDoServidor(erro, mostrarErroContatos);
    } finally {
      botaoSalvar.disabled = false;
    }
  }

  function mostrarErroContatos(mensagem) {
    elementos.erroContatos.textContent = mensagem;
    elementos.erroContatos.classList.toggle('oculto', !mensagem);
  }

  // ---------- Configurações ----------

  function preencherConfiguracoes() {
    const configuracao = armazenamento.obterConfiguracao();
    document.getElementById('campo-valor-minimo').value = String(configuracao.valorMinimo).replace('.', ',');
    preencherContatos();
  }

  async function salvarConfiguracoes(evento) {
    evento.preventDefault();
    const elementoErro = document.getElementById('erro-configuracao');
    const mostrarErro = (mensagem) => {
      elementoErro.textContent = mensagem;
      elementoErro.classList.toggle('oculto', !mensagem);
    };
    const valorMinimo = lerValorMonetario(document.getElementById('campo-valor-minimo').value || '0');

    if (!Number.isFinite(valorMinimo) || valorMinimo < 0) {
      mostrarErro('Informe um valor mínimo válido (ex.: 300,00).');
      return;
    }
    mostrarErro('');

    const botaoSalvar = evento.target.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    try {
      const valorSalvo = await api.salvarValorMinimo(Math.round(valorMinimo * 100) / 100);
      armazenamento.salvarConfiguracao({ valorMinimo: valorSalvo, origemServidor: true });
      document.getElementById('campo-valor-minimo').value = String(valorSalvo).replace('.', ',');
      componentes.mostrarToast('Configurações salvas');
    } catch (erro) {
      tratarErroDoServidor(erro, mostrarErro);
    } finally {
      botaoSalvar.disabled = false;
    }
  }

  // ---------- Troca de senha ----------

  async function trocarSenha(evento) {
    evento.preventDefault();
    const campoSenhaAtual = document.getElementById('campo-senha-atual');
    const campoNovaSenha = document.getElementById('campo-nova-senha');
    const campoConfirmacao = document.getElementById('campo-confirmar-senha');
    const elementoErro = document.getElementById('erro-senha');
    const mostrarErro = (mensagem) => {
      elementoErro.textContent = mensagem;
      elementoErro.classList.toggle('oculto', !mensagem);
    };

    if (campoNovaSenha.value.length < 10) {
      mostrarErro('A nova senha precisa ter pelo menos 10 caracteres.');
      return;
    }
    if (campoNovaSenha.value !== campoConfirmacao.value) {
      mostrarErro('A nova senha e a repetição não conferem.');
      return;
    }
    mostrarErro('');

    const botaoSalvar = evento.target.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    try {
      await api.trocarSenha(campoSenhaAtual.value, campoNovaSenha.value);
      evento.target.reset();
      esconderSenhas();
      componentes.mostrarToast('Senha trocada');
    } catch (erro) {
      tratarErroDoServidor(erro, mostrarErro);
    } finally {
      botaoSalvar.disabled = false;
    }
  }

  // ---------- Verificação em duas etapas (2FA) ----------

  /** Segunda etapa do login: a senha estava certa, falta o código do app. */
  function mostrarEtapaDoCodigo() {
    document.getElementById('formulario-login').classList.add('oculto');
    const formularioCodigo = document.getElementById('formulario-codigo');
    formularioCodigo.reset();
    mostrarErroEm('erro-codigo', '');
    formularioCodigo.classList.remove('oculto');
    document.getElementById('campo-codigo').focus();
  }

  async function confirmarCodigoDoLogin(evento) {
    evento.preventDefault();
    const campoCodigo = document.getElementById('campo-codigo');
    const codigo = campoCodigo.value.trim();
    if (!codigo) return mostrarErroEm('erro-codigo', 'Digite o código do app.');

    const botaoConfirmar = document.getElementById('botao-confirmar-codigo');
    botaoConfirmar.disabled = true;
    try {
      await api.confirmarCodigoDoLogin(codigo);
      await abrirPainel();
    } catch (erro) {
      // 401 aqui é o tempo para digitar o código que acabou: volta para a senha
      if (erro.codigoHttp === 401) {
        mostrarLogin(erro.message);
      } else {
        mostrarErroEm('erro-codigo', erro.message);
        campoCodigo.select();
      }
    } finally {
      botaoConfirmar.disabled = false;
    }
  }

  function configurarDoisFatores() {
    document.getElementById('formulario-ativar-2fa').addEventListener('submit', iniciarDoisFatores);
    document.getElementById('formulario-confirmar-2fa').addEventListener('submit', confirmarDoisFatores);
    document.getElementById('botao-cancelar-2fa').addEventListener('click', carregarDoisFatores);
    document.getElementById('formulario-desativar-2fa').addEventListener('submit', desativarDoisFatores);
    document.getElementById('formulario-novos-codigos').addEventListener('submit', gerarNovosCodigos);
    document.getElementById('botao-baixar-codigos').addEventListener('click', baixarCodigosDeRecuperacao);
    document.getElementById('botao-codigos-guardados').addEventListener('click', carregarDoisFatores);
    document.getElementById('botao-ir-dois-fatores').addEventListener('click', () => {
      selecionarAba('aba-configuracoes');
      document.getElementById('cartao-dois-fatores').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /** Mostra só uma das etapas do cartão: desligado, configurando, códigos ou ligado. */
  function mostrarEtapaDoisFatores(etapa) {
    const etapas = {
      desligado: 'formulario-ativar-2fa',
      configurando: 'formulario-confirmar-2fa',
      codigos: 'etapa-codigos-recuperacao',
      ligado: 'gerenciar-2fa',
    };
    Object.entries(etapas).forEach(([nomeEtapa, idElemento]) => {
      document.getElementById(idElemento).classList.toggle('oculto', nomeEtapa !== etapa);
    });
    ['erro-ativar-2fa', 'erro-confirmar-2fa', 'erro-desativar-2fa', 'erro-novos-codigos'].forEach((idErro) => mostrarErroEm(idErro, ''));
  }

  function mostrarSituacaoDoisFatores({ ativo, codigosRestantes }) {
    const elementoSituacao = document.getElementById('situacao-dois-fatores');
    const poucosCodigos = ativo && codigosRestantes <= 3;
    elementoSituacao.textContent = ativo
      ? `Ativa. Restam ${codigosRestantes} códigos de recuperação.${poucosCodigos ? ' Gere novos códigos.' : ''}`
      : 'Desligada. Ative para proteger sua conta.';
    elementoSituacao.classList.toggle('sucesso', ativo && !poucosCodigos);
    if (usuarioLogado) usuarioLogado.doisFatores = ativo;
    document.getElementById('aviso-dois-fatores').classList.toggle('oculto', !ehDono() || ativo);
  }

  async function carregarDoisFatores() {
    try {
      const situacao = await api.obterDoisFatores();
      mostrarSituacaoDoisFatores(situacao);
      mostrarEtapaDoisFatores(situacao.ativo ? 'ligado' : 'desligado');
    } catch (erro) {
      tratarErroDoServidor(erro, (mensagem) => {
        document.getElementById('situacao-dois-fatores').textContent = mensagem;
      });
    }
  }

  async function iniciarDoisFatores(evento) {
    evento.preventDefault();
    const campoSenha = document.getElementById('campo-senha-ativar-2fa');
    if (!campoSenha.value) return mostrarErroEm('erro-ativar-2fa', 'Digite sua senha.');
    const botaoAtivar = evento.target.querySelector('button[type="submit"]');
    botaoAtivar.disabled = true;
    try {
      const { segredo, enderecoOtpauth } = await api.iniciarDoisFatores(campoSenha.value);
      evento.target.reset();
      esconderSenhas();
      desenharQrCode(enderecoOtpauth);
      // Em grupos de 4 letras, mais fácil de digitar no app
      document.getElementById('chave-dois-fatores').textContent = segredo.match(/.{1,4}/g).join(' ');
      document.getElementById('formulario-confirmar-2fa').reset();
      mostrarEtapaDoisFatores('configurando');
      document.getElementById('campo-codigo-confirmar-2fa').focus();
    } catch (erro) {
      tratarErroDoServidor(erro, (mensagem) => mostrarErroEm('erro-ativar-2fa', mensagem));
    } finally {
      botaoAtivar.disabled = false;
    }
  }

  function desenharQrCode(endereco) {
    const geradorQr = raiz.qrcode(0, 'M');
    geradorQr.addData(endereco);
    geradorQr.make();
    const areaQr = document.getElementById('qr-dois-fatores');
    areaQr.innerHTML = geradorQr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
    areaQr.querySelector('svg').setAttribute('aria-label', 'QR code para o app autenticador');
  }

  async function confirmarDoisFatores(evento) {
    evento.preventDefault();
    const codigo = document.getElementById('campo-codigo-confirmar-2fa').value.trim();
    if (!/^\d{6}$/.test(codigo)) return mostrarErroEm('erro-confirmar-2fa', 'Digite os 6 números que aparecem no app.');
    const botaoConfirmar = evento.target.querySelector('button[type="submit"]');
    botaoConfirmar.disabled = true;
    try {
      const resultado = await api.confirmarDoisFatores(codigo);
      mostrarSituacaoDoisFatores(resultado);
      mostrarCodigosDeRecuperacao(resultado.codigosRecuperacao);
      componentes.mostrarToast('Verificação em duas etapas ativada');
    } catch (erro) {
      tratarErroDoServidor(erro, (mensagem) => mostrarErroEm('erro-confirmar-2fa', mensagem));
    } finally {
      botaoConfirmar.disabled = false;
    }
  }

  let codigosDeRecuperacaoNaTela = [];

  function mostrarCodigosDeRecuperacao(codigos) {
    codigosDeRecuperacaoNaTela = codigos;
    document.getElementById('lista-codigos-recuperacao').innerHTML = codigos
      .map((codigo) => `<li><code>${escaparHtml(codigo)}</code></li>`)
      .join('');
    mostrarEtapaDoisFatores('codigos');
  }

  function baixarCodigosDeRecuperacao() {
    const conteudo =
      'Códigos de recuperação do painel da Vivale Store\n' +
      `Usuário: ${usuarioLogado ? usuarioLogado.usuario : ''}\n\n` +
      'Cada código permite entrar uma vez sem o celular. Guarde em lugar seguro.\n\n' +
      codigosDeRecuperacaoNaTela.join('\n') +
      '\n';
    salvarArquivoNoComputador(new Blob([conteudo], { type: 'text/plain;charset=utf-8' }), 'vivale-codigos-de-recuperacao.txt');
  }

  async function desativarDoisFatores(evento) {
    evento.preventDefault();
    const senha = document.getElementById('campo-senha-desativar-2fa').value;
    const codigo = document.getElementById('campo-codigo-desativar-2fa').value.trim();
    if (!senha || !codigo) return mostrarErroEm('erro-desativar-2fa', 'Digite sua senha e o código do app.');
    if (!confirm('Desativar a verificação em duas etapas? Sua conta fica protegida só pela senha.')) return;
    const botaoDesativar = evento.target.querySelector('button[type="submit"]');
    botaoDesativar.disabled = true;
    try {
      const situacao = await api.desativarDoisFatores(senha, codigo);
      evento.target.reset();
      esconderSenhas();
      mostrarSituacaoDoisFatores(situacao);
      mostrarEtapaDoisFatores('desligado');
      componentes.mostrarToast('Verificação em duas etapas desativada');
    } catch (erro) {
      tratarErroDoServidor(erro, (mensagem) => mostrarErroEm('erro-desativar-2fa', mensagem));
    } finally {
      botaoDesativar.disabled = false;
    }
  }

  async function gerarNovosCodigos(evento) {
    evento.preventDefault();
    const codigo = document.getElementById('campo-codigo-novos-codigos').value.trim();
    if (!codigo) return mostrarErroEm('erro-novos-codigos', 'Digite o código do app.');
    const botaoGerar = evento.target.querySelector('button[type="submit"]');
    botaoGerar.disabled = true;
    try {
      const resultado = await api.gerarNovosCodigosDeRecuperacao(codigo);
      evento.target.reset();
      mostrarSituacaoDoisFatores(resultado);
      mostrarCodigosDeRecuperacao(resultado.codigosRecuperacao);
    } catch (erro) {
      tratarErroDoServidor(erro, (mensagem) => mostrarErroEm('erro-novos-codigos', mensagem));
    } finally {
      botaoGerar.disabled = false;
    }
  }

  // ---------- Equipe (só o dono) ----------

  async function carregarEquipe() {
    try {
      renderizarEquipe(await api.listarEquipe());
    } catch (erro) {
      tratarErroDoServidor(erro, (mensagem) => {
        elementos.listaEquipe.innerHTML = `<p class="mensagem-erro">${escaparHtml(mensagem)}</p>`;
      });
    }
  }

  function renderizarEquipe(usuarios) {
    elementos.listaEquipe.innerHTML = usuarios.map(montarHtmlLinhaFuncionario).join('');
  }

  function montarHtmlLinhaFuncionario(usuario) {
    const ehFuncionario = usuario.papel === 'funcionario';
    const ultimoAcesso = usuario.ultimoAcesso
      ? new Date(usuario.ultimoAcesso.replace(' ', 'T')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : 'nunca entrou';
    const acoes = ehFuncionario
      ? `<div class="grupo-botoes">
          <button class="botao botao-contorno botao-pequeno" type="button" data-acao="nova-senha">Nova senha</button>
          <button class="botao botao-contorno botao-pequeno" type="button" data-acao="alternar-funcionario">${usuario.ativo ? 'Desativar' : 'Reativar'}</button>
          ${usuario.doisFatores ? '<button class="botao botao-contorno botao-pequeno" type="button" data-acao="desligar-2fa">Desligar 2FA</button>' : ''}
        </div>`
      : '';
    return `
      <div class="linha-funcionario-admin ${usuario.ativo ? '' : 'desativado'}" data-id-funcionario="${usuario.id}"
        data-nome="${escaparHtml(usuario.nome)}" data-ativo="${usuario.ativo}">
        <div>
          <strong>${escaparHtml(usuario.nome)}</strong>
          <span class="etiqueta">${ehFuncionario ? 'Funcionário' : 'Dono'}</span>
          ${usuario.ativo ? '' : '<span class="etiqueta">Desativado</span>'}
          ${usuario.doisFatores ? '<span class="etiqueta">2FA ativo</span>' : ''}
          <p>Usuário: ${escaparHtml(usuario.usuario)} · último acesso: ${escaparHtml(ultimoAcesso)}</p>
        </div>
        ${acoes}
      </div>`;
  }

  function mostrarErroEm(idElemento, mensagem) {
    const elementoErro = document.getElementById(idElemento);
    elementoErro.textContent = mensagem;
    elementoErro.classList.toggle('oculto', !mensagem);
  }

  async function cadastrarFuncionario(evento) {
    evento.preventDefault();
    const nome = document.getElementById('funcionario-nome').value.trim();
    const usuario = document.getElementById('funcionario-usuario').value.trim().toLowerCase();
    const senha = document.getElementById('funcionario-senha').value;
    const mostrarErro = (mensagem) => mostrarErroEm('erro-novo-funcionario', mensagem);

    if (!nome) return mostrarErro('Informe o nome do funcionário.');
    if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) {
      return mostrarErro('O usuário deve ter de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado (sem espaço nem acento).');
    }
    if (senha.length < 10) return mostrarErro('A senha precisa ter pelo menos 10 caracteres.');
    mostrarErro('');

    const botaoSalvar = evento.target.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    try {
      renderizarEquipe(await api.cadastrarFuncionario(usuario, nome, senha));
      evento.target.reset();
      esconderSenhas();
      componentes.mostrarToast(`${nome} cadastrado`);
    } catch (erro) {
      tratarErroDoServidor(erro, mostrarErro);
    } finally {
      botaoSalvar.disabled = false;
    }
  }

  async function tratarAcaoFuncionario(evento) {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao) return;
    const linha = botao.closest('[data-id-funcionario]');
    const idFuncionario = Number(linha.dataset.idFuncionario);
    const nomeFuncionario = linha.dataset.nome;

    if (botao.dataset.acao === 'nova-senha') {
      idFuncionarioEmEdicao = idFuncionario;
      document.getElementById('formulario-senha-funcionario').reset();
      esconderSenhas();
      mostrarErroEm('erro-senha-funcionario', '');
      document.getElementById('titulo-senha-funcionario').textContent = `Nova senha de ${nomeFuncionario}`;
      elementos.janelaSenhaFuncionario.showModal();
      document.getElementById('funcionario-nova-senha').focus();
    } else if (botao.dataset.acao === 'alternar-funcionario') {
      const vaiDesativar = linha.dataset.ativo === 'true';
      if (vaiDesativar && !confirm(`Desativar ${nomeFuncionario}? A pessoa perde o acesso ao painel na hora.`)) return;
      botao.disabled = true;
      try {
        renderizarEquipe(await api.alterarFuncionario({ id: idFuncionario, ativo: !vaiDesativar }));
        componentes.mostrarToast(vaiDesativar ? `${nomeFuncionario} desativado` : `${nomeFuncionario} reativado`);
      } catch (erro) {
        botao.disabled = false;
        tratarErroDoServidor(erro, (mensagem) => alert(mensagem));
      }
    } else if (botao.dataset.acao === 'desligar-2fa') {
      const mensagemConfirmacao =
        `Desligar a verificação em duas etapas de ${nomeFuncionario}? ` +
        'Use só se a pessoa perdeu o celular e os códigos de recuperação. Depois ela pode ativar de novo.';
      if (!confirm(mensagemConfirmacao)) return;
      botao.disabled = true;
      try {
        renderizarEquipe(await api.alterarFuncionario({ id: idFuncionario, desativarDoisFatores: true }));
        componentes.mostrarToast(`2FA de ${nomeFuncionario} desligado`);
      } catch (erro) {
        botao.disabled = false;
        tratarErroDoServidor(erro, (mensagem) => alert(mensagem));
      }
    }
  }

  async function salvarSenhaFuncionario(evento) {
    evento.preventDefault();
    const novaSenha = document.getElementById('funcionario-nova-senha').value;
    const mostrarErro = (mensagem) => mostrarErroEm('erro-senha-funcionario', mensagem);
    if (novaSenha.length < 10) return mostrarErro('A senha precisa ter pelo menos 10 caracteres.');

    const botaoSalvar = evento.target.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    try {
      renderizarEquipe(await api.alterarFuncionario({ id: idFuncionarioEmEdicao, novaSenha }));
      elementos.janelaSenhaFuncionario.close();
      componentes.mostrarToast('Senha redefinida');
    } catch (erro) {
      tratarErroDoServidor(erro, mostrarErro);
    } finally {
      botaoSalvar.disabled = false;
    }
  }

  // ---------- Cópia de segurança ----------

  /** Faz o navegador salvar o arquivo com o nome indicado. */
  function salvarArquivoNoComputador(arquivo, nomeArquivo) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(arquivo);
    link.download = nomeArquivo;
    link.click();
    // Pequeno atraso para o navegador iniciar o download antes de liberar a memória
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function exportarCatalogo() {
    const conteudoArquivo = armazenamento.gerarArquivoDadosIniciais();
    salvarArquivoNoComputador(new Blob([conteudoArquivo], { type: 'text/javascript;charset=utf-8' }), 'dados-iniciais.js');
    componentes.mostrarToast('Catálogo baixado');
  }

  /** Mostra há quanto tempo foi o último backup; em amarelo quando já passou da hora de baixar outro. */
  function mostrarSituacaoDoBackup(situacao) {
    const elementoSituacao = document.getElementById('situacao-backup');
    const { emDia, texto } = utilidades.descreverSituacaoDoBackup(situacao);
    elementoSituacao.textContent = texto;
    elementoSituacao.classList.toggle('sucesso', emDia);
  }

  async function baixarBackupCompleto(evento) {
    const botaoBaixar = evento.currentTarget;
    const textoOriginal = botaoBaixar.textContent;
    botaoBaixar.disabled = true;
    botaoBaixar.textContent = 'Preparando o backup...';
    try {
      const { arquivo, nomeArquivo } = await api.baixarBackup();
      salvarArquivoNoComputador(arquivo, nomeArquivo);
      componentes.mostrarToast('Backup baixado. Guarde em lugar seguro.');
      const situacaoAtual = await api.carregarPainel();
      mostrarSituacaoDoBackup(situacaoAtual.backup);
    } catch (erro) {
      tratarErroDoServidor(erro, (mensagem) => componentes.mostrarToast(mensagem));
    } finally {
      botaoBaixar.disabled = false;
      botaoBaixar.textContent = textoOriginal;
    }
  }

  raiz.Loja.telaAdmin = { iniciar };
})(window);
