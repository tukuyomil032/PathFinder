import type { ChatInputCommandInteraction, Interaction, InteractionReplyOptions } from "discord.js";
import {
  buildHelpMessage,
  HELP_COMMAND_OPTION_NAME,
  PREVIEW_INPUT_OPTION_NAME,
  RANDOM_OPTION_NAMES,
  resolvePreviewReference,
  resolveRandomQuery,
  resolveSearchQuery,
  SEARCH_OPTION_NAMES,
} from "./command-definitions";
import {
  getRuntimePreviewRuntime,
  shouldAllowAdultDetails,
  type PreviewRuntime,
} from "./preview-runtime";
import { getRuntimeRandomRuntime, type RandomRuntime } from "./random-runtime";
import { getRuntimeSearchRuntime, type SearchRuntime } from "./search-runtime";

type InteractionCreateDeps = {
  previewRuntime: PreviewRuntime;
  searchRuntime: SearchRuntime;
  randomRuntime: RandomRuntime;
};

export function createInteractionHandler(deps: InteractionCreateDeps) {
  return async function handleInteractionCreate(interaction: Interaction): Promise<void> {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("search:")) {
        await deps.searchRuntime.handleButton(interaction);
      } else if (interaction.customId.startsWith("random:")) {
        await deps.randomRuntime.handleButton(interaction);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName === "help") {
      await replyHelp(interaction);
      return;
    }

    if (interaction.commandName === "search") {
      const query = resolveSearchQuery({
        store: interaction.options.getString(SEARCH_OPTION_NAMES.store, true),
        keyword: interaction.options.getString(SEARCH_OPTION_NAMES.keyword, true),
        sort: interaction.options.getString(SEARCH_OPTION_NAMES.sort, false),
        priceMin: interaction.options.getInteger(SEARCH_OPTION_NAMES.priceMin, false),
        priceMax: interaction.options.getInteger(SEARCH_OPTION_NAMES.priceMax, false),
        circle: interaction.options.getString(SEARCH_OPTION_NAMES.circle, false),
      });

      await deps.searchRuntime.resolve(
        query,
        interaction,
        shouldAllowAdultDetails(interaction.channel as never),
      );
      return;
    }

    if (interaction.commandName === "random") {
      const input = resolveRandomQuery({
        store: interaction.options.getString(RANDOM_OPTION_NAMES.store, false),
        keyword: interaction.options.getString(RANDOM_OPTION_NAMES.keyword, false),
      });

      await deps.randomRuntime.resolve(
        input,
        interaction,
        shouldAllowAdultDetails(interaction.channel as never),
      );
      return;
    }

    if (interaction.commandName !== "dlsite" && interaction.commandName !== "fanza") {
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const input = interaction.options.getString(PREVIEW_INPUT_OPTION_NAME, true);
    const resolved = resolvePreviewReference({
      commandName: interaction.commandName,
      subcommand: subcommand as "maniax" | "books" | "pro" | "doujin" | "av" | "game" | "book",
      input,
    });

    if ("usage" in resolved) {
      await interaction.reply({
        content: resolved.usage,
        ephemeral: true,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const payload = await deps.previewRuntime.resolve(
      resolved.reference,
      shouldAllowAdultDetails(interaction.channel as never),
    );

    await interaction.reply(toInteractionReplyOptions(payload));
  };
}

let runtimeHandler: ((interaction: Interaction) => Promise<void>) | null = null;

function getRuntimeHandler() {
  runtimeHandler ??= createInteractionHandler({
    previewRuntime: getRuntimePreviewRuntime(),
    searchRuntime: getRuntimeSearchRuntime(),
    randomRuntime: getRuntimeRandomRuntime(),
  });

  return runtimeHandler;
}

export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
  await getRuntimeHandler()(interaction);
}

async function replyHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const topic = interaction.options.getString(HELP_COMMAND_OPTION_NAME, false) ?? undefined;

  await interaction.reply({
    content: buildHelpMessage(topic as "dlsite" | "fanza" | "help" | undefined),
    ephemeral: true,
    allowedMentions: { repliedUser: false },
  });
}

function toInteractionReplyOptions(
  payload: Awaited<ReturnType<PreviewRuntime["resolve"]>>,
): InteractionReplyOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
    allowedMentions: payload.allowedMentions,
  };
}
