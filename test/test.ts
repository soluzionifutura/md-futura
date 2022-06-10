import { join } from "path"
import { mdFutura } from "../src"
void (async(): Promise<void> => {
  await mdFutura({
    sourcePath: join(__dirname, "md"),
    port: 8001,
    mdTheme: "github-markdown-light",
    codeTheme: "stackoverflow-light",
    hotReload: true
  })
})()
  // eslint-disable-next-line no-console
  .catch(console.error)

