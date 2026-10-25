/**
 * Painel do Vendedor: login simples, CRUD de produtos e configurações da loja.
 *
 * ATENÇÃO: a senha é validada no próprio navegador. Isso apenas esconde o painel
 * de clientes curiosas; não é uma proteção real (qualquer pessoa pode ler o código).
 */
(function (raiz) {
  'use strict';

  const { armazenamento, utilidades, componentes, imagem } = raiz.Loja;
  const { formatarMoeda, escaparHtml, lerValorMonetario, normalizarTelefone, gerarId } = utilidades;

  const CHAVE_SESSAO = 'loja_atacado_admin_logado';
  const elementos = {};
  let idProdutoEmEdicao = null;
  let fotoAtual = '';

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
    elementos.campoCores = document.getElementById('produto-cores');
    elementos.campoAtivo = document.getElementById('produto-ativo');

    prepararTelaLogin();
    document.getElementById('formulario-login').addEventListener('submit', entrar);
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

    document.getElementById('formulario-configuracao').addEventListener('submit', salvarConfiguracoes);
    document.getElementById('botao-exportar').addEventListener('click', exportarCatalogo);
    document.getElementById('botao-restaurar').addEventListener('click', restaurarExemplo);

    if (sessionStorage.getItem(CHAVE_SESSAO) === 'sim') {
      mostrarPainel();
    }
  }

  // ---------- Autenticação simples ----------

  const TAMANHO_MINIMO_SENHA = 6;

  /** Sem senha cadastrada neste navegador, o login vira a criação da senha (primeiro acesso). */
  function prepararTelaLogin() {
    const primeiroAcesso = armazenamento.obterSenhaAdmin() === null;
    document.getElementById('texto-login').textContent = primeiroAcesso
      ? `Primeiro acesso neste navegador: crie a senha do painel (mínimo ${TAMANHO_MINIMO_SENHA} caracteres).`
      : 'Digite a senha para gerenciar o catálogo.';
    document.getElementById('botao-entrar').textContent = primeiroAcesso ? 'Criar senha e entrar' : 'Entrar';
    document
      .getElementById('campo-senha')
      .setAttribute('autocomplete', primeiroAcesso ? 'new-password' : 'current-password');
  }

  function mostrarErroLogin(mensagem) {
    const elementoErro = document.getElementById('erro-login');
    elementoErro.textContent = mensagem;
    elementoErro.classList.remove('oculto');
  }

  function entrar(evento) {
    evento.preventDefault();
    const campoSenha = document.getElementById('campo-senha');
    const senhaCorreta = armazenamento.obterSenhaAdmin();

    if (senhaCorreta === null) {
      if (campoSenha.value.length < TAMANHO_MINIMO_SENHA) {
        mostrarErroLogin(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
        return;
      }
      armazenamento.salvarSenhaAdmin(campoSenha.value);
    } else if (campoSenha.value !== senhaCorreta) {
      mostrarErroLogin('Senha incorreta.');
      campoSenha.select();
      return;
    }

    sessionStorage.setItem(CHAVE_SESSAO, 'sim');
    campoSenha.value = '';
    document.getElementById('erro-login').classList.add('oculto');
    mostrarPainel();
  }

  function sair() {
    sessionStorage.removeItem(CHAVE_SESSAO);
    prepararTelaLogin();
    elementos.painel.classList.add('oculto');
    elementos.telaLogin.classList.remove('oculto');
  }

  function mostrarPainel() {
    elementos.telaLogin.classList.add('oculto');
    elementos.painel.classList.remove('oculto');
    renderizarProdutos();
    preencherConfiguracoes();
  }

  function trocarAba(evento) {
    const abaClicada = evento.currentTarget;
    document.querySelectorAll('.aba').forEach((aba) => {
      const selecionada = aba === abaClicada;
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
          <p>${escaparHtml(produto.tamanhos.join(', '))} · ${escaparHtml(produto.cores.join(', '))}</p>
          <div class="acoes-produto-admin">
            <button class="botao botao-contorno botao-pequeno" type="button" data-acao="editar">Editar</button>
            <button class="botao botao-contorno botao-pequeno" type="button" data-acao="alternar">${ativo ? 'Inativar' : 'Ativar'}</button>
            <button class="botao botao-perigo botao-pequeno" type="button" data-acao="excluir">Excluir</button>
          </div>
        </div>
      </article>`;
  }

  function tratarAcaoProduto(evento) {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao) return;
    const idProduto = botao.closest('[data-id]').dataset.id;
    const produto = armazenamento.obterProdutoPorId(idProduto);
    if (!produto) return;

    if (botao.dataset.acao === 'editar') {
      abrirFormulario(produto);
    } else if (botao.dataset.acao === 'alternar') {
      const salvou = salvarComTratamento({ ...produto, ativo: produto.ativo === false });
      if (salvou) {
        componentes.mostrarToast(produto.ativo === false ? 'Produto ativado' : 'Produto inativado');
      }
    } else if (botao.dataset.acao === 'excluir') {
      if (!confirm(`Excluir "${produto.nome}" definitivamente?`)) return;
      armazenamento.removerProduto(idProduto);
      renderizarProdutos();
      componentes.mostrarToast('Produto excluído');
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
      caixa.checked = produto ? produto.tamanhos.includes(caixa.value) : true;
    });

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

  async function tratarUploadFoto() {
    const arquivo = elementos.campoFotoArquivo.files[0];
    if (!arquivo) return;
    try {
      elementos.campoFotoUrl.value = '';
      definirFoto(await imagem.converterParaBase64Reduzido(arquivo));
    } catch (erro) {
      mostrarErroProduto(erro.message);
    }
  }

  function mostrarErroProduto(mensagem) {
    elementos.erroProduto.textContent = mensagem;
    elementos.erroProduto.classList.remove('oculto');
  }

  /** Lê o formulário e devolve { produto } ou { erro }. */
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
        id: idProdutoEmEdicao || gerarId(),
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

  function salvarFormularioProduto(evento) {
    evento.preventDefault();
    const resultado = lerFormularioProduto();
    if (resultado.erro) {
      mostrarErroProduto(resultado.erro);
      return;
    }
    if (salvarComTratamento(resultado.produto)) {
      elementos.janelaProduto.close();
      componentes.mostrarToast(idProdutoEmEdicao ? 'Produto atualizado' : 'Produto cadastrado');
    }
  }

  /** Salva o produto e trata o caso de LocalStorage cheio. Retorna true se deu certo. */
  function salvarComTratamento(produto) {
    try {
      armazenamento.salvarProduto(produto);
      renderizarProdutos();
      return true;
    } catch (erro) {
      // Com o formulário aberto o erro aparece nele; na lista, só um alerta fica visível
      if (elementos.janelaProduto.open) {
        mostrarErroProduto(erro.message);
      } else {
        alert(erro.message);
      }
      return false;
    }
  }

  // ---------- Configurações ----------

  function preencherConfiguracoes() {
    const configuracao = armazenamento.obterConfiguracao();
    document.getElementById('campo-whatsapp').value = configuracao.numeroWhatsApp;
    document.getElementById('campo-valor-minimo').value = String(configuracao.valorMinimo).replace('.', ',');
  }

  function salvarConfiguracoes(evento) {
    evento.preventDefault();
    const elementoErro = document.getElementById('erro-configuracao');
    const numeroWhatsApp = normalizarTelefone(document.getElementById('campo-whatsapp').value);
    const valorMinimo = lerValorMonetario(document.getElementById('campo-valor-minimo').value || '0');
    const campoNovaSenha = document.getElementById('campo-nova-senha');

    let mensagemErro = '';
    if (numeroWhatsApp.length < 12 || numeroWhatsApp.length > 13) {
      mensagemErro = 'Informe o WhatsApp com DDD, ex.: (11) 99999-9999.';
    } else if (!Number.isFinite(valorMinimo) || valorMinimo < 0) {
      mensagemErro = 'Informe um valor mínimo válido (ex.: 300,00).';
    } else if (campoNovaSenha.value && campoNovaSenha.value.length < TAMANHO_MINIMO_SENHA) {
      mensagemErro = `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
    }

    elementoErro.textContent = mensagemErro;
    elementoErro.classList.toggle('oculto', !mensagemErro);
    if (mensagemErro) return;

    armazenamento.salvarConfiguracao({
      numeroWhatsApp,
      valorMinimo: Math.round(valorMinimo * 100) / 100,
    });
    if (campoNovaSenha.value) armazenamento.salvarSenhaAdmin(campoNovaSenha.value);
    campoNovaSenha.value = '';
    preencherConfiguracoes();
    componentes.mostrarToast('Configurações salvas');
  }

  // ---------- Exportar / restaurar ----------

  function exportarCatalogo() {
    const conteudoArquivo = armazenamento.gerarArquivoDadosIniciais();
    const arquivo = new Blob([conteudoArquivo], { type: 'text/javascript;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(arquivo);
    link.download = 'dados-iniciais.js';
    link.click();
    // Pequeno atraso para o navegador iniciar o download antes de liberar a memória
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    componentes.mostrarToast('Arquivo exportado');
  }

  function restaurarExemplo() {
    const confirmou = confirm(
      'Isso apaga os produtos e configurações deste navegador e volta aos dados de exemplo ' +
        '(a senha do painel é mantida). Continuar?',
    );
    if (!confirmou) return;
    armazenamento.restaurarDadosIniciais();
    renderizarProdutos();
    preencherConfiguracoes();
    componentes.mostrarToast('Dados de exemplo restaurados');
  }

  raiz.Loja.telaAdmin = { iniciar };
})(window);
