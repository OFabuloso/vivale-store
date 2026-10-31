/**
 * Contatos de WhatsApp da loja: para quem a cliente pode enviar o pedido.
 * Cada contato tem o formato { id, nome, numero } (número só com dígitos, já com o DDI 55).
 * Funciona no navegador (window.Loja.contatos) e no Node (module.exports) para os testes.
 */
(function (raiz) {
  'use strict';

  const ambienteNode = typeof module !== 'undefined' && module.exports;
  const utilidades = ambienteNode ? require('./utilidades.js') : raiz.Loja.utilidades;

  // Nome usado quando a loja ainda tinha um único número (versões antigas)
  const NOME_CONTATO_PADRAO = 'Atendimento';

  /** Gera um identificador único simples para contatos. */
  function gerarIdContato() {
    const parteTempo = Date.now().toString(36);
    const parteAleatoria = Math.random().toString(36).slice(2, 8);
    return `contato-${parteTempo}-${parteAleatoria}`;
  }

  /** Número com DDI 55 + DDD + 8 ou 9 dígitos (12 ou 13 dígitos no total). */
  function numeroEhValido(numeroNormalizado) {
    return numeroNormalizado.length === 12 || numeroNormalizado.length === 13;
  }

  /** Converte o número único antigo em uma lista com um contato. */
  function converterNumeroAntigo(numeroWhatsApp) {
    return [
      {
        id: 'contato-principal',
        nome: NOME_CONTATO_PADRAO,
        numero: utilidades.normalizarTelefone(numeroWhatsApp),
      },
    ];
  }

  /** Mantém só os contatos com o formato esperado. */
  function filtrarContatosBemFormados(listaContatos) {
    return listaContatos
      .filter((contato) => contato && typeof contato === 'object')
      .map((contato) => ({
        id: String(contato.id || gerarIdContato()),
        nome: String(contato.nome || '').trim() || NOME_CONTATO_PADRAO,
        numero: utilidades.normalizarTelefone(contato.numero),
      }));
  }

  /** Lê os contatos de uma configuração; devolve null se ela não tiver nenhum. */
  function lerContatosDe(configuracao) {
    if (!configuracao || typeof configuracao !== 'object') return null;
    if (Array.isArray(configuracao.contatosWhatsApp) && configuracao.contatosWhatsApp.length > 0) {
      return filtrarContatosBemFormados(configuracao.contatosWhatsApp);
    }
    if (configuracao.numeroWhatsApp) return converterNumeroAntigo(configuracao.numeroWhatsApp);
    return null;
  }

  /**
   * Decide quais contatos valem: primeiro os salvos neste navegador (inclusive o número
   * único das versões antigas), depois os do arquivo de dados iniciais.
   */
  function resolverContatos(configuracaoSalva, configuracaoPadrao) {
    return lerContatosDe(configuracaoSalva) || lerContatosDe(configuracaoPadrao) || [];
  }

  /**
   * Valida a lista editada no painel. Devolve { contatos } já normalizados ou { erro }.
   */
  function validarContatos(listaContatos) {
    if (!Array.isArray(listaContatos) || listaContatos.length === 0) {
      return { erro: 'Cadastre pelo menos um contato de WhatsApp.' };
    }

    const contatosValidados = [];
    const numerosUsados = new Set();

    for (const [posicao, contato] of listaContatos.entries()) {
      const nome = String(contato.nome || '').trim();
      const numero = utilidades.normalizarTelefone(contato.numero);

      if (!nome) return { erro: `Informe o nome do contato ${posicao + 1}.` };
      if (!numeroEhValido(numero)) {
        return { erro: `O WhatsApp de "${nome}" é inválido. Use DDD + número, ex.: (21) 99999-9999.` };
      }
      if (numerosUsados.has(numero)) {
        return { erro: `O número de "${nome}" já está em outro contato.` };
      }

      numerosUsados.add(numero);
      contatosValidados.push({ id: contato.id || gerarIdContato(), nome, numero });
    }

    return { contatos: contatosValidados };
  }

  /** Mostra o número no padrão brasileiro: "5521979396729" → "(21) 97939-6729". */
  function formatarTelefone(numero) {
    const apenasDigitos = utilidades.normalizarTelefone(numero);
    const semDdi = numeroEhValido(apenasDigitos) && apenasDigitos.startsWith('55')
      ? apenasDigitos.slice(2)
      : '';
    if (!semDdi) return apenasDigitos ? `+${apenasDigitos}` : '';

    const ddd = semDdi.slice(0, 2);
    const assinante = semDdi.slice(2);
    const tamanhoInicio = assinante.length - 4;
    return `(${ddd}) ${assinante.slice(0, tamanhoInicio)}-${assinante.slice(tamanhoInicio)}`;
  }

  const api = {
    NOME_CONTATO_PADRAO,
    gerarIdContato,
    resolverContatos,
    validarContatos,
    formatarTelefone,
  };

  if (ambienteNode) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.contatos = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
