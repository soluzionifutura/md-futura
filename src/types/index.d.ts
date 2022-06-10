export type CodeSnippet = {
  name: string,
  code: string,
  language: string
}

export type CompiledMd = {
  html: string,
  contentHtml: string,
  mdPath: string,
  snippets: CodeSnippet[]
}

export type CodeTheme = "a11y-dark" | "a11y-light" | "agate" | "an-old-hope" | "androidstudio" | "arduino-light" | "arta" | "ascetic" | "atom-one-dark-reasonable" | "atom-one-dark" | "atom-one-light" | "brown-paper" | "codepen-embed" | "color-brewer" | "dark" | "default" | "devibeans" | "docco" | "far" | "felipec" | "foundation" | "github-dark-dimmed" | "github-dark" | "github" | "gml" | "googlecode" | "gradient-dark" | "gradient-light" | "grayscale" | "hybrid" | "idea" | "intellij-light" | "ir-black" | "isbl-editor-dark" | "isbl-editor-light" | "kimbie-dark" | "kimbie-light" | "lightfair" | "lioshi" | "magula" | "mono-blue" | "monokai-sublime" | "monokai" | "night-owl" | "nnfx-dark" | "nnfx-light" | "nord" | "obsidian" | "paraiso-dark" | "paraiso-light" | "pojoaque" | "purebasic" | "qtcreator-dark" | "qtcreator-light" | "rainbow" | "routeros" | "school-book" | "shades-of-purple" | "srcery" | "stackoverflow-dark" | "stackoverflow-light" | "sunburst" | "tokyo-night-dark" | "tokyo-night-light" | "tomorrow-night-blue" | "tomorrow-night-bright" | "vs" | "vs2015" | "xcode" | "xt256"

export type MdTheme = "github-markdown" | "github-markdown-dark" | "github-markdown-light"

export type LanguagePlugin = ((data: { snippetPath: string, code: string }) => string[]) | null

export type LanguagePlugins = {
  [language: string]: LanguagePlugin
}
