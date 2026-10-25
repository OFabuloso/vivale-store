/**
 * Tela do catálogo: filtros (categoria, tamanho, cor), grade de produtos e janela de detalhe.
 */
(function (raiz) {
  'use strict';

  const { armazenamento, utilidades, componentes, telaCarrinho } = raiz.Loja;
  const { formatarMoeda, escaparHtml, obterFundoDaCor } = utilidades;

  // Ordem de exibição dos tamanhos nos filtros
  const ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'U'];

  const filtrosAtivos = { categoria: null, tamanho: null, cor: null };
  const escolhaAtual = { produto: null, tamanho: null, cor: null };
  const elementos = {};

  function iniciar() {
    elementos.grade = document.getElementById('grade-produtos');
    elementos.filtroCategoria = document.getElementById('filtro-categoria');
    elementos.filtroTamanho = document.getElementById('filtro-tamanho');
    elementos.filtroCor = document.getElementById('filtro-cor');
    elementos.quantidadeResultados = document.getElementById('quantidade-resultados');
    elementos.botaoLimparFiltros = document.getElementById('botao-limpar-filtros');
    elementos.seloMinimo = document.getElementById('selo-minimo');

    elementos.janela = document.getElementById('janela-produto');
    elementos.detalheFoto = document.getElementById('detalhe-produto-foto');
    elementos.detalheCategoria = document.getElementById('detalhe-produto-categoria');
    elementos.detalheNome = document.getElementById('detalhe-produto-nome');
    elementos.detalhePreco = document.getElementById('detalhe-produto-preco');
    elementos.detalheDescricao = document.getElementById('detalhe-produto-descricao');
    elementos.detalheTamanhos = document.getElementById('detalhe-tamanhos');
    elementos.detalheCores = document.getElementById('detalhe-cores');
    elementos.tamanhoEscolhido = document.getElementById('detalhe-tamanho-escolhido');
    elementos.corEscolhida = document.getElementById('detalhe-cor-escolhida');
    elementos.quantidade = document.getElementById('detalhe-quantidade');
    elementos.erro = document.getElementById('detalhe-erro');

    componentes.configurarJanela(elementos.janela);

    [elementos.filtroCategoria, elementos.filtroTamanho, elementos.filtroCor].forEach((lista) =>
      lista.addEventListener('click', tratarCliqueNoFiltro),
    );
    elementos.botaoLimparFiltros.addEventListener('click', limparFiltros);
    elementos.grade.addEventListener('click', tratarCliqueNoProduto);

    elementos.detalheTamanhos.addEventListener('click', (evento) =>
      escolherOpcao(evento, 'tamanho'),
    );
    elementos.detalheCores.addEventListener('click', (evento) => escolherOpcao(evento, 'cor'));
    document.getElementById('detalhe-diminuir').addEventListener('click', () => mudarQuantidade(-1));
    document.getElementById('detalhe-aumentar').addEventListener('click', () => mudarQuantidade(1));
    document.getElementById('botao-adicionar-carrinho').addEventListener('click', adicionarAoCarrinho);

    // Se o Admin alterar o catálogo em outra aba, a loja se atualiza sozinha
    raiz.addEventListener('storage', (evento) => {
      if (
        evento.key === armazenamento.CHAVES.produtos ||
        evento.key === armazenamento.CHAVES.configuracao
      ) {
        renderizar();
        telaCarrinho.atualizar();
      }
    });

    renderizar();
  }

  // ---------- Filtros ----------

  function produtoAtendeFiltros(produto) {
    const atendeCategoria = !filtrosAtivos.categoria || produto.categoria === filtrosAtivos.categoria;
    const atendeTamanho = !filtrosAtivos.tamanho || produto.tamanhos.includes(filtrosAtivos.tamanho);
    const atendeCor = !filtrosAtivos.cor || produto.cores.includes(filtrosAtivos.cor);
    return atendeCategoria && atendeTamanho && atendeCor;
  }

  /** Lista valores únicos de um campo dos produtos (ex.: todas as cores existentes). */
  function listarValoresUnicos(produtos, extrairValores) {
    const valoresUnicos = new Set();
    produtos.forEach((produto) => [].concat(extrairValores(produto)).forEach((valor) => valoresUnicos.add(valor)));
    return [...valoresUnicos];
  }

  function ordenarTamanhos(tamanhos) {
    const posicao = (tamanho) => {
      const indice = ORDEM_TAMANHOS.indexOf(tamanho);
      return indice === -1 ? ORDEM_TAMANHOS.length : indice;
    };
    return [...tamanhos].sort((primeiro, segundo) => posicao(primeiro) - posicao(segundo));
  }

  function montarChip(tipoFiltro, valor, rotulo, comBolinhaDeCor) {
    const selecionado = filtrosAtivos[tipoFiltro] === valor;
    const bolinha = comBolinhaDeCor
      ? `<span class="bolinha-cor" style="background:${obterFundoDaCor(valor)}"></span>`
      : '';
    const valorAtributo = valor === null ? '' : escaparHtml(valor);
    return `<button type="button" class="chip" data-filtro="${tipoFiltro}" data-valor="${valorAtributo}" aria-pressed="${selecionado}">${bolinha}${escaparHtml(rotulo)}</button>`;
  }

  function renderizarFiltros(produtos) {
    const categorias = listarValoresUnicos(produtos, (produto) => produto.categoria).sort();
    const tamanhos = ordenarTamanhos(listarValoresUnicos(produtos, (produto) => produto.tamanhos));
    const cores = listarValoresUnicos(produtos, (produto) => produto.cores).sort();

    elementos.filtroCategoria.innerHTML =
      montarChip('categoria', null, 'Todas') +
      categorias.map((categoria) => montarChip('categoria', categoria, categoria)).join('');
    elementos.filtroTamanho.innerHTML =
      montarChip('tamanho', null, 'Todos') +
      tamanhos.map((tamanho) => montarChip('tamanho', tamanho, tamanho)).join('');
    elementos.filtroCor.innerHTML =
      montarChip('cor', null, 'Todas') +
      cores.map((cor) => montarChip('cor', cor, cor, true)).join('');
  }

  function tratarCliqueNoFiltro(evento) {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
    const valorClicado = chip.dataset.valor || null;
    const tipoFiltro = chip.dataset.filtro;
    // Clicar no filtro já selecionado desmarca
    filtrosAtivos[tipoFiltro] = filtrosAtivos[tipoFiltro] === valorClicado ? null : valorClicado;
    renderizar();
  }

  function limparFiltros() {
    filtrosAtivos.categoria = null;
    filtrosAtivos.tamanho = null;
    filtrosAtivos.cor = null;
    renderizar();
  }

  // ---------- Grade de produtos ----------

  function renderizar() {
    const produtosAtivos = armazenamento.obterProdutosAtivos();
    const configuracao = armazenamento.obterConfiguracao();
    const produtosFiltrados = produtosAtivos.filter(produtoAtendeFiltros);
    const algumFiltroAtivo = Object.values(filtrosAtivos).some(Boolean);

    elementos.seloMinimo.textContent = `Pedido mínimo ${formatarMoeda(configuracao.valorMinimo)}`;
    renderizarFiltros(produtosAtivos);

    elementos.quantidadeResultados.textContent = `${produtosFiltrados.length} ${
      produtosFiltrados.length === 1 ? 'peça' : 'peças'
    }`;
    elementos.botaoLimparFiltros.classList.toggle('oculto', !algumFiltroAtivo);

    if (produtosFiltrados.length === 0) {
      elementos.grade.innerHTML = `<p class="estado-vazio">Nenhuma peça encontrada com esses filtros.</p>`;
      return;
    }

    elementos.grade.innerHTML = produtosFiltrados.map(montarHtmlCartao).join('');
    elementos.grade.querySelectorAll('img[data-id]').forEach((elementoImagem, posicao) => {
      componentes.aplicarFotoComReserva(elementoImagem, produtosFiltrados[posicao]);
    });
  }

  function montarHtmlCartao(produto) {
    const bolinhas = produto.cores
      .map(
        (cor) =>
          `<span class="bolinha-cor" title="${escaparHtml(cor)}" style="background:${obterFundoDaCor(cor)}"></span>`,
      )
      .join('');
    return `
      <button type="button" class="cartao-produto" data-id-produto="${escaparHtml(produto.id)}">
        <img class="cartao-produto-foto" data-id="${escaparHtml(produto.id)}" alt="${escaparHtml(produto.nome)}" loading="lazy" />
        <span class="cartao-produto-categoria">${escaparHtml(produto.categoria)}</span>
        <h3 class="cartao-produto-nome">${escaparHtml(produto.nome)}</h3>
        <span class="cartao-produto-preco">${formatarMoeda(produto.preco)} <small>/peça</small></span>
        <span class="cartao-produto-cores">${bolinhas}</span>
      </button>`;
  }

  function tratarCliqueNoProduto(evento) {
    const cartao = evento.target.closest('[data-id-produto]');
    if (!cartao) return;
    const produto = armazenamento.obterProdutoPorId(cartao.dataset.idProduto);
    if (produto) abrirDetalhe(produto);
  }

  // ---------- Janela de detalhe ----------

  function abrirDetalhe(produto) {
    escolhaAtual.produto = produto;
    // Pré-seleciona quando só existe uma opção (ou quando o filtro já indica a escolha)
    escolhaAtual.tamanho = escolherPadrao(produto.tamanhos, filtrosAtivos.tamanho);
    escolhaAtual.cor = escolherPadrao(produto.cores, filtrosAtivos.cor);

    componentes.aplicarFotoComReserva(elementos.detalheFoto, produto);
    elementos.detalheFoto.alt = produto.nome;
    elementos.detalheCategoria.textContent = produto.categoria;
    elementos.detalheNome.textContent = produto.nome;
    elementos.detalhePreco.textContent = `${formatarMoeda(produto.preco)} por peça`;
    // Produtos antigos podem não ter descrição: nesse caso o parágrafo fica escondido
    elementos.detalheDescricao.textContent = produto.descricao || '';
    elementos.detalheDescricao.classList.toggle('oculto', !produto.descricao);
    elementos.quantidade.value = '1';
    elementos.erro.classList.add('oculto');

    renderizarOpcoes();
    elementos.janela.showModal();
  }

  function escolherPadrao(opcoes, valorDoFiltro) {
    if (valorDoFiltro && opcoes.includes(valorDoFiltro)) return valorDoFiltro;
    return opcoes.length === 1 ? opcoes[0] : null;
  }

  function renderizarOpcoes() {
    const { produto, tamanho, cor } = escolhaAtual;

    elementos.detalheTamanhos.innerHTML = ordenarTamanhos(produto.tamanhos)
      .map(
        (opcao) =>
          `<button type="button" class="opcao" data-valor="${escaparHtml(opcao)}" aria-pressed="${opcao === tamanho}">${escaparHtml(opcao)}</button>`,
      )
      .join('');
    elementos.detalheCores.innerHTML = produto.cores
      .map(
        (opcao) =>
          `<button type="button" class="opcao opcao-cor" data-valor="${escaparHtml(opcao)}" aria-pressed="${opcao === cor}">` +
          `<span class="bolinha-cor" style="background:${obterFundoDaCor(opcao)}"></span>${escaparHtml(opcao)}</button>`,
      )
      .join('');

    elementos.tamanhoEscolhido.textContent = tamanho ? `· ${tamanho}` : '';
    elementos.corEscolhida.textContent = cor ? `· ${cor}` : '';
  }

  function escolherOpcao(evento, tipoOpcao) {
    const botao = evento.target.closest('.opcao');
    if (!botao) return;
    escolhaAtual[tipoOpcao] = botao.dataset.valor;
    elementos.erro.classList.add('oculto');
    renderizarOpcoes();
  }

  function lerQuantidade() {
    const quantidade = Math.floor(Number(elementos.quantidade.value));
    return Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1;
  }

  function mudarQuantidade(variacao) {
    elementos.quantidade.value = String(Math.max(1, lerQuantidade() + variacao));
  }

  function adicionarAoCarrinho() {
    const { produto, tamanho, cor } = escolhaAtual;
    if (!tamanho || !cor) {
      elementos.erro.textContent = 'Escolha o tamanho e a cor antes de adicionar.';
      elementos.erro.classList.remove('oculto');
      return;
    }

    const quantidade = lerQuantidade();
    telaCarrinho.adicionar(produto, tamanho, cor, quantidade);
    elementos.janela.close();
    componentes.mostrarToast(`${quantidade}x ${produto.nome} adicionado ao pedido`);
  }

  raiz.Loja.telaCatalogo = { iniciar, renderizar };
})(window);
