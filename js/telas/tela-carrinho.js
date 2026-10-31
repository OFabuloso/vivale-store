/**
 * Tela do carrinho: contador, barra inferior, gaveta com itens, validação do mínimo
 * e encaminhamento para a escolha do contato de WhatsApp (contato.html).
 */
(function (raiz) {
  'use strict';

  const { armazenamento, carrinho, utilidades, componentes } = raiz.Loja;
  const { formatarMoeda, escaparHtml } = utilidades;

  const elementos = {};

  function iniciar() {
    elementos.contador = document.getElementById('contador-carrinho');
    elementos.barra = document.getElementById('barra-carrinho');
    elementos.barraPecas = document.getElementById('barra-carrinho-pecas');
    elementos.barraTotal = document.getElementById('barra-carrinho-total');
    elementos.janela = document.getElementById('janela-carrinho');
    elementos.lista = document.getElementById('lista-carrinho');
    elementos.rodape = document.getElementById('rodape-carrinho');
    elementos.resumoPecas = document.getElementById('resumo-pecas');
    elementos.resumoTotal = document.getElementById('resumo-total');
    elementos.barraProgresso = document.getElementById('progresso-minimo-barra');
    elementos.avisoMinimo = document.getElementById('aviso-minimo');
    elementos.botaoWhatsApp = document.getElementById('botao-finalizar-whatsapp');
    elementos.observacoes = document.getElementById('observacoes-pedido');

    componentes.configurarJanela(elementos.janela);
    document.getElementById('botao-abrir-carrinho').addEventListener('click', abrir);
    document.getElementById('botao-barra-carrinho').addEventListener('click', abrir);
    document.getElementById('botao-esvaziar-carrinho').addEventListener('click', esvaziar);
    elementos.botaoWhatsApp.addEventListener('click', finalizarNoWhatsApp);
    elementos.lista.addEventListener('click', tratarCliqueNaLista);
    elementos.lista.addEventListener('change', tratarMudancaDeQuantidade);
    elementos.observacoes.addEventListener('input', guardarObservacoes);

    // Recupera as observações escritas antes de recarregar a página
    elementos.observacoes.value = armazenamento.obterObservacoes();

    // Mantém abas diferentes do navegador sincronizadas
    raiz.addEventListener('storage', (evento) => {
      if (evento.key === armazenamento.CHAVES.carrinho) atualizar();
      if (evento.key === armazenamento.CHAVES.observacoes) {
        elementos.observacoes.value = armazenamento.obterObservacoes();
      }
    });

    atualizar();
  }

  function abrir() {
    atualizar();
    elementos.janela.showModal();
  }

  /** Recebe a escolha feita no catálogo e grava no carrinho. */
  function adicionar(produto, tamanho, cor, quantidade) {
    const itensAtualizados = carrinho.adicionarItem(
      armazenamento.obterCarrinho(),
      produto,
      tamanho,
      cor,
      quantidade,
    );
    armazenamento.salvarCarrinho(itensAtualizados);
    atualizar();
  }

  function esvaziar() {
    if (!confirm('Deseja remover todos os itens do carrinho?')) return;
    armazenamento.salvarCarrinho([]);
    elementos.observacoes.value = '';
    guardarObservacoes();
    atualizar();
  }

  /** Salva as observações a cada digitação; uma falha não pode travar o carrinho. */
  function guardarObservacoes() {
    try {
      armazenamento.salvarObservacoes(elementos.observacoes.value);
    } catch (erro) {
      console.warn('Não foi possível salvar as observações.', erro);
    }
  }

  function alterarItem(chave, novaQuantidade) {
    const itensAtualizados = carrinho.alterarQuantidade(
      armazenamento.obterCarrinho(),
      chave,
      novaQuantidade,
    );
    armazenamento.salvarCarrinho(itensAtualizados);
    atualizar();
  }

  function tratarCliqueNaLista(evento) {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao) return;
    const chave = botao.closest('[data-chave]').dataset.chave;
    const itemAtual = armazenamento.obterCarrinho().find((item) => item.chave === chave);
    if (!itemAtual) return;

    if (botao.dataset.acao === 'aumentar') alterarItem(chave, itemAtual.quantidade + 1);
    if (botao.dataset.acao === 'diminuir') alterarItem(chave, itemAtual.quantidade - 1);
    if (botao.dataset.acao === 'remover') alterarItem(chave, 0);
  }

  function tratarMudancaDeQuantidade(evento) {
    if (!evento.target.matches('input[data-quantidade]')) return;
    const chave = evento.target.closest('[data-chave]').dataset.chave;
    alterarItem(chave, evento.target.value);
  }

  /**
   * Lê o carrinho já ajustado ao catálogo atual (preços, nomes e itens indisponíveis)
   * e grava o ajuste, avisando a cliente quando algo mudou. Devolve { itens, houveMudanca }.
   */
  function sincronizarCarrinho() {
    const sincronizacao = carrinho.sincronizarComCatalogo(
      armazenamento.obterCarrinho(),
      armazenamento.obterProdutosAtivos(),
    );
    if (sincronizacao.houveMudanca) {
      armazenamento.salvarCarrinho(sincronizacao.itens);
      componentes.mostrarToast('Seu pedido foi atualizado conforme o catálogo atual.');
    }
    return sincronizacao;
  }

  /** Redesenha todos os pontos da tela que dependem do carrinho. */
  function atualizar() {
    const { itens } = sincronizarCarrinho();
    const configuracao = armazenamento.obterConfiguracao();
    const totalPecas = carrinho.contarPecas(itens);
    const situacaoMinimo = carrinho.validarPedidoMinimo(itens, configuracao.valorMinimo);
    const textoPecas = `${totalPecas} ${totalPecas === 1 ? 'peça' : 'peças'}`;

    // Contador do cabeçalho e barra inferior
    elementos.contador.textContent = String(totalPecas);
    elementos.contador.classList.toggle('oculto', totalPecas === 0);
    elementos.barra.classList.toggle('oculto', totalPecas === 0);
    elementos.barraPecas.textContent = textoPecas;
    elementos.barraTotal.textContent = formatarMoeda(situacaoMinimo.valorTotal);

    // Lista de itens
    if (itens.length === 0) {
      elementos.lista.innerHTML =
        '<div class="carrinho-vazio"><p>Seu carrinho está vazio.</p><p>Que tal escolher algumas peças? 🌸</p></div>';
      elementos.rodape.classList.add('oculto');
      return;
    }
    elementos.rodape.classList.remove('oculto');
    elementos.lista.innerHTML = itens.map(montarHtmlItem).join('');
    preencherFotos(itens);

    // Resumo e validação do pedido mínimo
    elementos.resumoPecas.textContent = textoPecas;
    elementos.resumoTotal.textContent = formatarMoeda(situacaoMinimo.valorTotal);
    elementos.barraProgresso.style.width = `${situacaoMinimo.percentualAtingido}%`;
    elementos.barraProgresso.classList.toggle('completo', situacaoMinimo.atingido);
    elementos.avisoMinimo.classList.toggle('sucesso', situacaoMinimo.atingido);
    elementos.avisoMinimo.textContent = situacaoMinimo.atingido
      ? `Pedido mínimo de ${formatarMoeda(configuracao.valorMinimo)} atingido! ✨`
      : `O pedido mínimo no atacado é ${formatarMoeda(configuracao.valorMinimo)}. ` +
        `Adicione mais ${formatarMoeda(situacaoMinimo.valorFaltante)} em peças para finalizar.`;
    elementos.botaoWhatsApp.disabled = !situacaoMinimo.atingido;
  }

  function montarHtmlItem(item) {
    return `
      <article class="item-carrinho" data-chave="${escaparHtml(item.chave)}">
        <img alt="" data-foto-produto="${escaparHtml(item.idProduto)}" />
        <div>
          <p class="item-carrinho-nome">${escaparHtml(item.nome)}</p>
          <p class="item-carrinho-variacao">
            ${escaparHtml(item.tamanho)} · ${escaparHtml(item.cor)} · ${formatarMoeda(item.preco)}/peça
          </p>
          <div class="item-carrinho-acoes">
            <div class="seletor-quantidade compacto">
              <button type="button" data-acao="diminuir" aria-label="Diminuir">−</button>
              <input type="number" min="1" inputmode="numeric" value="${item.quantidade}" data-quantidade aria-label="Quantidade" />
              <button type="button" data-acao="aumentar" aria-label="Aumentar">+</button>
            </div>
            <span class="item-carrinho-subtotal">${formatarMoeda(carrinho.calcularSubtotal(item))}</span>
          </div>
          <button class="botao-remover" type="button" data-acao="remover">Remover</button>
        </div>
      </article>`;
  }

  /** As fotos vêm do catálogo (não são duplicadas no carrinho para economizar espaço). */
  function preencherFotos(itens) {
    elementos.lista.querySelectorAll('img[data-foto-produto]').forEach((elementoImagem, posicao) => {
      const item = itens[posicao];
      const produto = armazenamento.obterProdutoPorId(item.idProduto) || {
        nome: item.nome,
        cores: [item.cor],
        foto: '',
      };
      componentes.aplicarFotoComReserva(elementoImagem, produto);
    });
  }

  function finalizarNoWhatsApp() {
    const { itens, houveMudanca } = sincronizarCarrinho();
    const configuracao = armazenamento.obterConfiguracao();
    const situacaoMinimo = carrinho.validarPedidoMinimo(itens, configuracao.valorMinimo);
    // Se o catálogo mudou desde a última tela, mostra o pedido corrigido antes de enviar
    if (houveMudanca || !situacaoMinimo.atingido) {
      atualizar();
      return;
    }

    // A escolha do atendimento acontece numa nova guia (contato.html), que lê o mesmo
    // carrinho e as observações do LocalStorage e só então abre o WhatsApp.
    // O carrinho é esvaziado lá; esta guia se atualiza sozinha pelo evento "storage".
    guardarObservacoes();
    raiz.open('contato.html', '_blank', 'noopener');
    componentes.mostrarToast('Escolha o atendimento na nova guia.');
  }

  raiz.Loja.telaCarrinho = { iniciar, abrir, adicionar, atualizar };
})(window);
