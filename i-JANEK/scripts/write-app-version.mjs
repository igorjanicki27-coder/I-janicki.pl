#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version
if (!/^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$/u.test(version)) {
  throw new Error(`Nieprawidłowa wersja aplikacji: ${version}`)
}
writeFileSync(resolve('resources/scripts/app-version.txt'), `${version}\n`)
