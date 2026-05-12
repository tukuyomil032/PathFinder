import type { ChatInputCommandInteraction, Interaction, InteractionReplyOptions } from "discord.js";
import {
  buildHelpMessage,
  HELP_COMMAND_OPTION_NAME,
  PREVIEW_INPUT_OPTION_NAME,
  resolvePreviewReference,
} from "./command-definitions";
import {
  getRuntimePreviewRuntime,
  shouldAllowAdultDetails,
  type PreviewRuntime,
} from "./preview-runtime";

type InteractionCreateDeps = {
  previewRuntime: PreviewRuntime;
};

export function createInteractionHandler(deps: InteractionCreateDeps) {
  return async function handleInteractionCreate(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName === "help") {
      await replyHelp(interaction);
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
