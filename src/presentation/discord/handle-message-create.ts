import type { Message } from "discord.js";
import { extractWorkReferences } from "../../domain/rj/extract-work-references";
import {
  getRuntimePreviewRuntime,
  shouldAllowAdultDetails,
  type PreviewRuntime,
} from "./preview-runtime";

type MessageCreateDeps = {
  previewRuntime: PreviewRuntime;
};

export function createMessageHandler(deps: MessageCreateDeps) {
  return async function handleMessageCreate(message: Message): Promise<void> {
    if (message.author.bot) {
      return;
    }

    const [reference] = extractWorkReferences(message.content);

    if (!reference) {
      return;
    }

    await message.reply(
      await deps.previewRuntime.resolve(reference, shouldAllowAdultDetails(message.channel)),
    );
  };
}

let runtimeHandler: ((message: Message) => Promise<void>) | null = null;

function getRuntimeHandler() {
  runtimeHandler ??= createMessageHandler({
    previewRuntime: getRuntimePreviewRuntime(),
  });

  return runtimeHandler;
}

export async function handleMessageCreate(message: Message): Promise<void> {
  await getRuntimeHandler()(message);
}
