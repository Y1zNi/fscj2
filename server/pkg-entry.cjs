#!/usr/bin/env node
'use strict'

require('./desktopServer.cjs')
  .start()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
