/**
 * Tela de escolha do contato (contato.html): a cliente escolhe com quem falar
 * e só então é encaminhada ao WhatsApp com a mensagem do pedido pronta.
 * Lê o carrinho e as observações do LocalStorage (os mesmos da loja).
 */
(function (raiz) {
  'use strict';

  const { armazenamento, carrinho, whatsapp, contatos, utilidades, componentes } = raiz.Loja;
  const { formatarMoeda, escaparHtml } = utilidades;

  const elementos = {};

  // Ícone do WhatsApp (herda o dourado do botão)
  const ICONE_WHATSAPP = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>`;

  const ICONE_SETA = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;

  function iniciar() {
    elementos.resumo = document.getElementById('resumo-pedido-contato');
    elementos.lista = document.getElementById('lista-contatos');
    elementos.aviso = document.getElementById('aviso-contato');

    elementos.lista.addEventListener('click', tratarEscolhaDeContato);
    // "pageshow" também dispara ao voltar do WhatsApp pelo botão Voltar (cache do navegador)
    raiz.addEventListener('pageshow', renderizar);
    // Mantém a tela em dia se o carrinho mudar na guia da loja
    raiz.addEventListener('storage', renderizar);
  }

  /** Lê o pedido já ajustado ao catálogo atual e diz se ele pode ser enviado. */
  function lerPedido() {
    const sincronizacao = carrinho.sincronizarComCatalogo(
      armazenamento.obterCarrinho(),
      armazenamento.obterProdutosAtivos(),
    );
    if (sincronizacao.houveMudanca) {
      armazenamento.salvarCarrinho(sincronizacao.itens);
      componentes.mostrarToast('Seu pedido foi atualizado conforme o catálogo atual.');
    }
    const configuracao = armazenamento.obterConfiguracao();
    return {
      itens: sincronizacao.itens,
      configuracao,
      situacaoMinimo: carrinho.validarPedidoMinimo(sincronizacao.itens, configuracao.valorMinimo),
    };
  }

  /** Esconde a lista e mostra uma mensagem no lugar dela. */
  function mostrarAviso(mensagem) {
    elementos.lista.innerHTML = '';
    elementos.resumo.classList.add('oculto');
    elementos.aviso.textContent = mensagem;
    elementos.aviso.classList.remove('oculto');
  }

  function renderizar() {
    const { itens, configuracao, situacaoMinimo } = lerPedido();

    if (itens.length === 0) {
      mostrarAviso('Não há pedido em andamento. Volte à loja para escolher suas peças.');
      return;
    }
    if (!situacaoMinimo.atingido) {
      mostrarAviso(
        `O pedido mínimo no atacado é ${formatarMoeda(configuracao.valorMinimo)}. ` +
          `Volte à loja e adicione mais ${formatarMoeda(situacaoMinimo.valorFaltante)} em peças.`,
      );
      return;
    }
    if (configuracao.contatosWhatsApp.length === 0) {
      mostrarAviso('Nenhum atendimento disponível no momento. Tente novamente mais tarde.');
      return;
    }

    const totalPecas = carrinho.contarPecas(itens);
    elementos.resumo.textContent =
      `${totalPecas} ${totalPecas === 1 ? 'peça' : 'peças'} · ${formatarMoeda(situacaoMinimo.valorTotal)}`;
    elementos.resumo.classList.remove('oculto');
    elementos.aviso.classList.add('oculto');
    elementos.lista.innerHTML = configuracao.contatosWhatsApp.map(montarHtmlContato).join('');
  }

  function montarHtmlContato(contato) {
    return `
      <li>
        <button class="botao-contato" type="button" data-id-contato="${escaparHtml(contato.id)}">
          <span class="botao-contato-icone">${ICONE_WHATSAPP}</span>
          <span class="botao-contato-texto">
            <span class="botao-contato-nome">${escaparHtml(contato.nome)}</span>
            <span class="botao-contato-numero">${escaparHtml(contatos.formatarTelefone(contato.numero))}</span>
          </span>
          <span class="botao-contato-seta">${ICONE_SETA}</span>
        </button>
      </li>`;
  }

  function tratarEscolhaDeContato(evento) {
    const botao = evento.target.closest('button[data-id-contato]');
    if (!botao) return;

    // Relê tudo no momento do clique: o pedido pode ter mudado em outra guia
    const { itens, configuracao, situacaoMinimo } = lerPedido();
    const contatoEscolhido = configuracao.contatosWhatsApp.find(
      (contato) => contato.id === botao.dataset.idContato,
    );
    if (!contatoEscolhido || itens.length === 0 || !situacaoMinimo.atingido) {
      renderizar();
      return;
    }

    try {
      const linkWhatsApp = whatsapp.gerarLinkWhatsApp(
        contatoEscolhido.numero,
        itens,
        armazenamento.obterObservacoes(),
      );
      // Itens e observações já vão na mensagem; o próximo pedido começa do zero
      armazenamento.salvarCarrinho([]);
      armazenamento.salvarObservacoes('');
      mostrarAviso(`Abrindo o WhatsApp de ${contatoEscolhido.nome}...`);
      raiz.location.assign(linkWhatsApp);
    } catch (erro) {
      componentes.mostrarToast(erro.message);
    }
  }

  raiz.Loja.telaContato = { iniciar };
})(window);
