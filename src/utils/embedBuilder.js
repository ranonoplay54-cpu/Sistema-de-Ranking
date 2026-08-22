const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildPanelComponents() {
  const embed = new EmbedBuilder()
    .setTitle('⚡ PAINEL DE CONTROLE — RANKING OFICIAL ⚡')
    .setDescription(
      'Bem-vindo ao centro de gerenciamento de pontuação.\n\n' +
      '**Regras de Pontuação:**\n' +
      '🥇 **Vitória:** `+3 pontos`\n' +
      '🔻 **Remover Vitória:** `-3 pontos`\n' +
      '⚠️ **Penalidade:** `-2 pontos`\n\n' +
      'Utilize os botões abaixo para gerenciar ou visualizar a classificação atual.'
    )
    .setColor('#FF4500')
    .setThumbnail('https://i.imgur.com/83u69Y7.png')
    .setFooter({ text: 'Sistema Oficial de Ranking • Free Fire', iconURL: 'https://i.imgur.com/83u69Y7.png' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_win')
      .setLabel('Definir Vencedor')
      .setEmoji('🟢')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('btn_remove_win')
      .setLabel('Remover Vitória')
      .setEmoji('🔴')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('btn_penalty')
      .setLabel('Penalizar')
      .setEmoji('⚠️')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_add_player')
      .setLabel('Adicionar Jogador')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_remove_player')
      .setLabel('Remover Jogador')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('btn_view_ranking')
      .setLabel('Ver Ranking')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Success)
  );

  return { embed, components: [row1, row2] };
}

function buildRankingEmbed(players) {
  const embed = new EmbedBuilder()
    .setTitle('🏆 RANKING INDIVIDUAL 🏆')
    .setColor('#FFD700')
    .setFooter({ text: 'Atualizado em tempo real' })
    .setTimestamp();

  if (players.length === 0) {
    embed.setDescription('Nenhum jogador cadastrado no ranking até o momento.');
    return embed;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rankingList = players.map((player, index) => {
    const icon = medals[index] || `${index + 1}️⃣`;
    return `${icon} <@${player.user_id}> — **${player.points} pts** \`(${player.wins}V | ${player.penalties}P)\``;
  });

  embed.setDescription(rankingList.join('\n'));
  return embed;
}

module.exports = { buildPanelComponents, buildRankingEmbed };
