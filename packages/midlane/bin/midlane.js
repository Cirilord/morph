#!/usr/bin/env node

import { runCli } from '@midlane/cli';

process.exitCode = await runCli(process.argv);
