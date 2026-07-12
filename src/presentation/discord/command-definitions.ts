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
import type { SearchQuery, SearchSortKey, SearchTarget } from "../../domain/search/types";
import type { RandomQueryInput } from "./random-runtime";

export const PREVIEW_INPUT_OPTION_NAME = "input";
export const HELP_COMMAND_OPTION_NAME = "command";
export const SEARCH_OPTION_NAMES = {
  store: "store",
  keyword: "keyword",
  sort: "sort",
  priceMin: "price_min",
  priceMax: "price_max",
  circle: "circle",
} as const;
export const RANDOM_OPTION_NAMES = {
  store: "store",
  keyword: "keyword",
} as const;

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

export const SEARCH_TARGET_CHOICES: Array<{ name: string; value: SearchTarget }> = [
  { name: "DLsite 同人 (maniax)", value: "dlsite_maniax" },
  { name: "DLsite Books", value: "dlsite_books" },
  { name: "DLsite 美少女ゲーム (pro)", value: "dlsite_pro" },
  { name: "FANZA 同人", value: "fanza_doujin" },
  { name: "FANZA PCゲーム", value: "fanza_pcgame" },
  { name: "FANZA BOOKS", value: "fanza_books" },
];

const SEARCH_SORT_CHOICES: Array<{ name: string; value: SearchSortKey }> = [
  { name: "人気順", value: "popularity" },
  { name: "新着順", value: "new" },
  { name: "価格が安い順", value: "price_asc" },
  { name: "価格が高い順", value: "price_desc" },
  { name: "評価が高い順", value: "rating" },
];

const SEARCH_COMMAND = new SlashCommandBuilder()
  .setName("search")
  .setDescription("DLSite / FANZA を横断してキーワード検索します")
  .addStringOption((option) =>
    option
      .setName(SEARCH_OPTION_NAMES.store)
      .setDescription("検索対象ストア/カテゴリ")
      .setRequired(true)
      .addChoices(...SEARCH_TARGET_CHOICES),
  )
  .addStringOption((option) =>
    option.setName(SEARCH_OPTION_NAMES.keyword).setDescription("検索キーワード").setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName(SEARCH_OPTION_NAMES.sort)
      .setDescription("並び順")
      .setRequired(false)
      .addChoices(...SEARCH_SORT_CHOICES),
  )
  .addIntegerOption((option) =>
    option
      .setName(SEARCH_OPTION_NAMES.priceMin)
      .setDescription("価格下限(円)")
      .setMinValue(0)
      .setRequired(false),
  )
  .addIntegerOption((option) =>
    option
      .setName(SEARCH_OPTION_NAMES.priceMax)
      .setDescription("価格上限(円)")
      .setMinValue(0)
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName(SEARCH_OPTION_NAMES.circle)
      .setDescription("サークル名/ブランド名で絞り込み")
      .setRequired(false),
  );

const RANDOM_COMMAND = new SlashCommandBuilder()
  .setName("random")
  .setDescription("DLSite / FANZA からランダムに作品と出会います")
  .addStringOption((option) =>
    option
      .setName(RANDOM_OPTION_NAMES.store)
      .setDescription("対象ストア/カテゴリ（省略時はランダム）")
      .setRequired(false)
      .addChoices(...SEARCH_TARGET_CHOICES),
  )
  .addStringOption((option) =>
    option
      .setName(RANDOM_OPTION_NAMES.keyword)
      .setDescription("絞り込みキーワード（省略時は全カタログからランダム）")
      .setRequired(false),
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
  return [DLsite_COMMAND, FANZA_COMMAND, SEARCH_COMMAND, RANDOM_COMMAND, HELP_COMMAND].map(
    (command) => command.toJSON(),
  );
}

export function resolveSearchQuery(params: {
  store: string;
  keyword: string;
  sort: string | null;
  priceMin: number | null;
  priceMax: number | null;
  circle: string | null;
}): SearchQuery {
  return {
    target: params.store as SearchTarget,
    keyword: params.keyword,
    ...(params.sort ? { sort: params.sort as SearchSortKey } : {}),
    ...(params.priceMin !== null ? { priceMin: params.priceMin } : {}),
    ...(params.priceMax !== null ? { priceMax: params.priceMax } : {}),
    ...(params.circle ? { circle: params.circle } : {}),
  };
}

export function resolveRandomQuery(params: {
  store: string | null;
  keyword: string | null;
}): RandomQueryInput {
  return {
    target: (params.store as SearchTarget | null) ?? null,
    keyword: params.keyword ?? "",
  };
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
      "/search store:<store> keyword:<keyword> [sort] [price_min] [price_max] [circle]",
      "/random [store] [keyword] - ランダムに作品と出会います（両方省略可）",
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
