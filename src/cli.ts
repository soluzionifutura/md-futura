#!/usr/bin/env node

import { join } from "path"
import { mdFutura } from "./index"

mdFutura({
  port: 80,
  buildPath: join(process.cwd(), ".mdf"),
  sourcePath: process.cwd()
// eslint-disable-next-line no-console
}).catch(console.error)
