import { join, parse } from "path"
import { marked } from "marked"
import { JSDOM } from "jsdom"
import { readFile, writeFile, readFileSync, mkdirpSync, rmdirSync } from "fs-extra"
import he from "he"
import { CodeSnippet, CodeTheme, CompiledMd, MdTheme } from "../types"
import hljs from "highlight.js"
import { createHash } from "crypto"

let codeCss: string
let mdCss: string
const template = readFileSync(join(__dirname, "../template.html"), "utf-8")

export const compileMd = async({ sourcePath, mdPath, buildPath, codeTheme, mdTheme, supportedLanguages }: { sourcePath: string, mdPath: string, buildPath: string, codeTheme: CodeTheme, mdTheme: MdTheme, supportedLanguages: string[] }): Promise<CompiledMd> => {
  if (!mdCss) {
    mdCss = readFileSync(join(require.resolve("github-markdown-css"), `../${mdTheme}.css`), "utf-8")
  }

  if (!codeCss) {
    codeCss = readFileSync(join(require.resolve("highlight.js"), `../../styles/${codeTheme}.css`), "utf-8")
  }

  const path = mdPath === sourcePath ? `/${parse(mdPath).base}` : mdPath.substring(sourcePath.length)
  const md = await readFile(mdPath, "utf-8")

  const dom = new JSDOM(template)
  const { window: { document } } = dom
  document.getElementById("code-style")!.innerHTML = codeCss
  document.getElementById("md-style")!.innerHTML = mdCss
  document.getElementById("content")!.innerHTML = marked.parse(md)

  const codeElements = dom.window.document.querySelectorAll("code[class^=language]")

  const snippets: CodeSnippet[] = []
  const promises = Array.from(codeElements).map((codeElement, i) => {
    const codeElementParent = codeElement.parentElement
    if (codeElementParent) {
      const [, language] = codeElement.className.split("language-")
      const codeSnippet = he.decode(codeElement.innerHTML)
      hljs.highlightElement(codeElement as HTMLElement)

      if (!supportedLanguages.includes(language)) {
        return
      }

      const preElementParent = codeElementParent.parentElement
      if (preElementParent) {
        const segmentName = `${createHash("md5").update(`${path}${i}`).digest("hex")}.${language}`
        const executeWrapperElement = dom.window.document.createElement("div")
        executeWrapperElement.id = segmentName
        executeWrapperElement.classList.add("js", "backend-code-exec-wrapper")
        executeWrapperElement.innerHTML = `
          ${codeElementParent.outerHTML}
          <button class="exec-button" id=${segmentName}-exec-button onclick="exec('${segmentName}')">run</button>
          <button class="clear-button" onclick="clearConsole('${segmentName}')">clear</button>
          <div class="console stick-to-bottom"><pre onscroll="onScroll(event)" id="${segmentName}-console"></pre></div>
        `
        preElementParent.replaceChild(executeWrapperElement, codeElementParent)

        snippets.push({
          name: segmentName,
          code: codeSnippet,
          language
        })
      }
    }
  })

  const html = dom.serialize()

  await Promise.all(promises)

  return {
    html,
    path,
    snippets
  }
}
