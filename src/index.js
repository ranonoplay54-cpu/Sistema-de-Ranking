require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  UserSelectMenuBuilder,
  ActionRowBuilder
} = require('discord.js');

const db = require('./database/db');
const { buildPanelComponents, buildRankingEmbed } = require('./utils/embedBuilder');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID;
const RANKING_CHANNEL_ID = process.env.RANKING_CHANNEL_ID;

// Verificação de permissão por ID do cargo
function hasOwnerPermission(member) {
  return member.roles.cache.has(OWNER_ROLE_ID);
}

// Registrar comando /ranking
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('ranking')
      .setDescription('Configura e inicializa o painel de ranking persistente')
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
}

client.once('ready', async () => {
  console.log(`[BOT] Conectado com sucesso como ${client.user.tag}`);
  await db.initDB();
  await registerCommands();

  // Recupera e revalida painel persistente
  try {
    const channel = await client.channels.fetch(RANKING_CHANNEL_ID);
    if (channel) {
      const savedMessageId = await db.getPanelMessageId();
      if (savedMessageId) {
        try {
          const message = await channel.messages.fetch(savedMessageId);
          const { embed, components } = buildPanelComponents();
          await message.edit({ embeds: [embed], components });
          console.log('[BOT] Painel de Ranking persistente revalidado com sucesso.');
        } catch (e) {
          console.log('[BOT] Painel anterior não encontrado no canal. Use /ranking para recriá-lo.');
        }
      }
    }
  } catch (error) {
    console.error('[ERRO] Falha ao verificar canal de ranking na inicialização:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    // 1. Comando Slash /ranking
    if (interaction.isChatInput() && interaction.commandName === 'ranking') {
      if (!hasOwnerPermission(interaction.member)) {
        return interaction.reply({
          content: '🔒 Você não possui permissão para utilizar esta função.',
          ephemeral: true
        });
      }

      const targetChannel = await client.channels.fetch(RANKING_CHANNEL_ID);
      if (!targetChannel) {
        return interaction.reply({ content: '❌ Canal de ranking não encontrado. Verifique a variável RANKING_CHANNEL_ID.', ephemeral: true });
      }

      const { embed, components } = buildPanelComponents();
      const panelMessage = await targetChannel.send({ embeds: [embed], components });
      await db.setPanelMessageId(panelMessage.id);

      return interaction.reply({
        content: `✅ Painel de controle inicializado com sucesso no canal <#${RANKING_CHANNEL_ID}>!`,
        ephemeral: true
      });
    }

    // 2. Interações de Botões
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Ver Ranking é público
      if (customId === 'btn_view_ranking') {
        const players = await db.getAllPlayers();
        const rankingEmbed = buildRankingEmbed(players);
        return interaction.reply({ embeds: [rankingEmbed], ephemeral: true });
      }

      // Demais ações requerem o cargo DONO
      if (!hasOwnerPermission(interaction.member)) {
        return interaction.reply({
          content: '🔒 Você não possui permissão para utilizar esta função.',
          ephemeral: true
        });
      }

      // Menus de seleção dinâmica de jogadores
      const selectActionMap = {
        'btn_win': { id: 'select_win', placeholder: 'Selecione o jogador vencedor (+3 pts)' },
        'btn_remove_win': { id: 'select_remove_win', placeholder: 'Selecione o jogador para remover vitória (-3 pts)' },
        'btn_penalty': { id: 'select_penalty', placeholder: 'Selecione o jogador para penalizar (-2 pts)' },
        'btn_add_player': { id: 'select_add_player', placeholder: 'Selecione o membro para adicionar ao ranking' },
        'btn_remove_player': { id: 'select_remove_player', placeholder: 'Selecione o membro para remover do ranking' }
      };

      const config = selectActionMap[customId];
      if (config) {
        const userSelect = new UserSelectMenuBuilder()
          .setCustomId(config.id)
          .setPlaceholder(config.placeholder)
          .setMinValues(1)
          .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(userSelect);
        return interaction.reply({ components: [row], ephemeral: true });
      }
    }

    // 3. Menus de Seleção de Usuários
    if (interaction.isUserSelectMenu()) {
      if (!hasOwnerPermission(interaction.member)) {
        return interaction.reply({
          content: '🔒 Você não possui permissão para utilizar esta função.',
          ephemeral: true
        });
      }

      const selectedUserId = interaction.values[0];
      const targetUser = interaction.users.get(selectedUserId);
      const player = await db.getPlayer(selectedUserId);

      switch (interaction.customId) {
        case 'select_add_player': {
          if (player) {
            return interaction.update({ content: `⚠️ <@${selectedUserId}> já está cadastrado no ranking.`, components: [] });
          }
          await db.addPlayer(selectedUserId, targetUser.username);
          return interaction.update({ content: `✅ <@${selectedUserId}> foi adicionado ao ranking com **0 pontos**.`, components: [] });
        }

        case 'select_remove_player': {
          if (!player) {
            return interaction.update({ content: `⚠️ <@${selectedUserId}> não está cadastrado no ranking.`, components: [] });
          }
          await db.removePlayer(selectedUserId);
          return interaction.update({ content: `❌ <@${selectedUserId}> foi completamente removido do ranking.`, components: [] });
        }

        case 'select_win': {
          if (!player) {
            return interaction.update({ content: `⚠️ <@${selectedUserId}> precisa ser adicionado ao ranking antes de pontuar.`, components: [] });
          }
          await db.registerWin(selectedUserId, interaction.user.id);
          return interaction.update({ content: `🟢 Vitória computada! <@${selectedUserId}> recebeu **+3 pontos**.`, components: [] });
        }

        case 'select_remove_win': {
          if (!player) {
            return interaction.update({ content: `⚠️ Jogador não cadastrado.`, components: [] });
          }
          if (player.wins <= 0) {
            return interaction.update({ content: `⚠️ <@${selectedUserId}> não possui vitórias registradas para serem removidas.`, components: [] });
          }
          await db.removeWin(selectedUserId, interaction.user.id);
          return interaction.update({ content: `🔴 Vitória removida! <@${selectedUserId}> perdeu **-3 pontos**.`, components: [] });
        }

        case 'select_penalty': {
          if (!player) {
            return interaction.update({ content: `⚠️ Jogador não cadastrado.`, components: [] });
          }
          await db.applyPenalty(selectedUserId, interaction.user.id);
          return interaction.update({ content: `⚠️ Penalidade aplicada! <@${selectedUserId}> perdeu **-2 pontos**.`, components: [] });
        }
      }
    }
  } catch (error) {
    console.error('[ERRO INTERACTION]', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Ocorreu um erro ao processar esta ação.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
