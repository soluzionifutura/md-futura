import { join } from "path"
import { mdFutura } from "../src"
void (async(): Promise<void> => {
  await mdFutura({
    sourcePath: join(__dirname, "md"),
    port: 8001,
    mdTheme: "github-markdown-dark",
    codeTheme: "stackoverflow-dark"
  })
})()
  // eslint-disable-next-line no-console
  .catch(console.error)

