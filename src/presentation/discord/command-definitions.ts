import {
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import {
  extractDlsiteReferenceFromUrl,
  isDlsiteWorkId,
} from "../../integrations/dlsite/fetch-work-page";
import { extractDmmReferenceFromUrl, normalizeDmmId } from "../../integrations/dmm/fetch-work-page";
import type { DLSiteSurface, WorkReference, WorkStore } from "../../domain/rj/types";

export const PREVIEW_INPUT_OPTION_NAME = "input";
export const HELP_COMMAND_OPTION_NAME = "command";

type PreviewCommandName = "dlsite" | "fanza";
type PreviewSubcommand = "maniax" | "books" | "pro" | "doujin" | "av" | "game" | "book";
type HelpTopic = PreviewCommandName | "help";

const DLSITE_USAGE: Record<DLSiteSurface, string> = {
  maniax: "使い方: /dlsite maniax input:RJ012345 または maniax 作品URL",
  books: "使い方: /dlsite books input:BJ02519460 または books 作品URL",
  pro: "使い方: /dlsite pro input:VJ01004728 または pro 作品URL",
};

const FANZA_USAGE: Record<Exclude<PreviewSubcommand, keyof typeof DLSITE_USAGE>, string> = {
  doujin: "使い方: /fanza doujin input:d123456 または FANZA同人URL",
  av: "使い方: /fanza av input:mide00924 または DMM TV作品URL",
  game: "使い方: /fanza game input:spal_0201 または FANZA GAMES作品URL",
  book: "使い方: /fanza book input:b915awnmg04288 または FANZA BOOKS作品URL",
};

const DLsite_COMMAND = new SlashCommandBuilder()
  .setName("dlsite")
  .setDescription("DLSite 作品を明示指定でプレビューします")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("maniax")
      .setDescription("DLSite maniax 作品を表示します")
      .addStringOption((option) =>
        option
          .setName(PREVIEW_INPUT_OPTION_NAME)
          .setDescription("RJ ID または maniax URL")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("books")
      .setDescription("DLSite books 作品を表示します")
      .addStringOption((option) =>
        option
          .setName(PREVIEW_INPUT_OPTION_NAME)
          .setDescription("BJ ID または books URL")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pro")
      .setDescription("DLSite pro 作品を表示します")
      .addStringOption((option) =>
        option
          .setName(PREVIEW_INPUT_OPTION_NAME)
          .setDescription("VJ ID または pro URL")
          .setRequired(true),
      ),
  );

const FANZA_COMMAND = new SlashCommandBuilder()
  .setName("fanza")
  .setDescription("FANZA / DMM 作品を明示指定でプレビューします")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("doujin")
      .setDescription("FANZA同人作品を表示します")
      .addStringOption((option) =>
        option
          .setName(PREVIEW_INPUT_OPTION_NAME)
          .setDescription("d123456 または FANZA同人URL")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("av")
      .setDescription("DMM TV AV作品を表示します")
      .addStringOption((option) =>
        option
          .setName(PREVIEW_INPUT_OPTION_NAME)
          .setDescription("mide00924 または DMM TV URL")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("game")
      .setDescription("FANZA GAMES作品を表示します")
      .addStringOption((option) =>
        option
          .setName(PREVIEW_INPUT_OPTION_NAME)
          .setDescription("spal_0201 または FANZA GAMES URL")
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("book")
      .setDescription("FANZA BOOKS作品を表示します")
      .addStringOption((option) =>
        option
          .setName(PREVIEW_INPUT_OPTION_NAME)
          .setDescription("b915awnmg04288 または FANZA BOOKS URL")
          .setRequired(true),
      ),
  );

const HELP_COMMAND = new SlashCommandBuilder()
  .setName("help")
  .setDescription("コマンド一覧と入力例を表示します")
  .addStringOption((option) =>
    option
      .setName(HELP_COMMAND_OPTION_NAME)
      .setDescription("詳しく見るコマンド")
      .addChoices(
        { name: "dlsite", value: "dlsite" },
        { name: "fanza", value: "fanza" },
        { name: "help", value: "help" },
      )
      .setRequired(false),
  );

export function buildApplicationCommands(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [DLsite_COMMAND, FANZA_COMMAND, HELP_COMMAND].map((command) => command.toJSON());
}

export function resolvePreviewReference(params: {
  commandName: PreviewCommandName;
  subcommand: PreviewSubcommand;
  input: string;
}): { reference: WorkReference } | { usage: string } {
  const input = params.input.trim();

  if (params.commandName === "dlsite") {
    return resolveDlsiteReference(params.subcommand as DLSiteSurface, input);
  }

  return resolveFanzaReference(
    params.subcommand as Exclude<PreviewSubcommand, DLSiteSurface>,
    input,
  );
}

export function buildHelpMessage(topic?: HelpTopic): string {
  if (!topic) {
    return [
      "コマンド一覧",
      "/dlsite maniax|books|pro input:<ID or URL>",
      "/fanza doujin|av|game|book input:<ID or URL>",
      "/help [command]",
      "",
      "入力形式",
      "- DLSite: RJ/BJ/VJ または対応URL",
      "- FANZA同人: d123456 / d_123456 または URL",
      "- DMM TV: mide00924 または URL",
      "- FANZA GAMES: spal_0201 または URL",
      "- FANZA BOOKS: b915awnmg04288 または URL",
      "",
      "代表例",
      "- /dlsite maniax input:RJ012345",
      "- /fanza av input:mide00924",
      "",
      "NSFW 挙動",
      "- /help は ephemeral です",
      "- プレビュー系コマンドは通常返信です",
      "- 非NSFWチャンネルでは成人向け詳細を抑制します",
      "- DMM family は非NSFWチャンネルで最小情報のみ表示します",
    ].join("\n");
  }

  if (topic === "dlsite") {
    return [
      "/dlsite",
      "- maniax: RJ ID または maniax URL",
      "- books: BJ ID または books URL",
      "- pro: VJ ID または pro URL",
      "",
      "例",
      "- /dlsite maniax input:RJ012345",
      "- /dlsite books input:https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
    ].join("\n");
  }

  if (topic === "fanza") {
    return [
      "/fanza",
      "- doujin: d123456 / d_123456 または FANZA同人URL",
      "- av: mide00924 または DMM TV URL",
      "- game: spal_0201 または FANZA GAMES URL",
      "- book: b915awnmg04288 または FANZA BOOKS URL",
      "",
      "例",
      "- /fanza doujin input:d123456",
      "- /fanza av input:https://tv.dmm.co.jp/detail/?content=mide00924",
      "",
      "補足",
      "- FANZA同人は bare ID で解決できない場合、URL付き送信を案内します",
    ].join("\n");
  }

  return [
    "/help [command]",
    "- command 省略時は全体一覧を表示します",
    "- command 指定時は `dlsite` / `fanza` / `help` のみ受け付けます",
  ].join("\n");
}

function resolveDlsiteReference(
  surface: DLSiteSurface,
  input: string,
): { reference: WorkReference } | { usage: string } {
  const urlReference = extractDlsiteReferenceFromUrl(input);

  if (urlReference) {
    return resolveDlsiteSurface(urlReference.id) === surface
      ? { reference: urlReference }
      : { usage: DLSITE_USAGE[surface] };
  }

  if (!isDlsiteWorkId(input) || resolveDlsiteSurface(input) !== surface) {
    return { usage: DLSITE_USAGE[surface] };
  }

  return {
    reference: {
      store: "dlsite",
      id: input.toUpperCase(),
      kind: "code",
      matchedText: input,
    },
  };
}

function resolveFanzaReference(
  subcommand: Exclude<PreviewSubcommand, DLSiteSurface>,
  input: string,
): { reference: WorkReference } | { usage: string } {
  const expectedStore = resolveFanzaStore(subcommand);
  const urlReference = extractDmmReferenceFromUrl(input);

  if (urlReference) {
    return urlReference.store === expectedStore
      ? { reference: urlReference }
      : { usage: FANZA_USAGE[subcommand] };
  }

  try {
    return {
      reference: {
        store: expectedStore,
        id: normalizeDmmId(expectedStore, input),
        kind: "code",
        matchedText: input,
      },
    };
  } catch {
    return { usage: FANZA_USAGE[subcommand] };
  }
}

function resolveDlsiteSurface(workId: string): DLSiteSurface {
  const normalized = workId.toUpperCase();

  if (normalized.startsWith("BJ")) {
    return "books";
  }

  if (normalized.startsWith("VJ")) {
    return "pro";
  }

  return "maniax";
}

function resolveFanzaStore(
  subcommand: Exclude<PreviewSubcommand, DLSiteSurface>,
): Exclude<WorkStore, "dlsite"> {
  switch (subcommand) {
    case "doujin":
      return "fanza_doujin";
    case "av":
      return "dmm_tv_av";
    case "game":
      return "fanza_pcgame";
    case "book":
      return "fanza_books";
  }
}
