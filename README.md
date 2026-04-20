<div align="center">
  <h1>Midlane</h1>
  <p>Transform your API into your domain.</p>
  <a href="https://www.npmjs.com/package/midlane"><img src="https://img.shields.io/npm/v/midlane.svg?style=flat" alt="npm version" /></a>
  <a href="https://github.com/Cirilord/midlane/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license" /></a>
  <a href="https://github.com/Cirilord/midlane/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/Cirilord/midlane/release.yml?branch=main" alt="release workflow" /></a>
  <a href="https://github.com/Cirilord/midlane/issues"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome" /></a>
  <br />
  <br />
  <a href="#quickstart-5min">Quickstart</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#documentation">Docs</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#how-midlane-works">How it works</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#contributing">Contributing</a>
</div>

---

## What is Midlane?

Midlane is a typed API layer for REST APIs. It lets you define your API contract in a schema file, then generate a strongly typed client for TypeScript.

Midlane is especially useful when your external API does not match your internal domain naming. With `@map`, you keep clean domain names in your app while Midlane automatically translates payload keys at runtime.

Core pieces:

- **Schema DSL** (`schema.midlane`): resources, actions, request/response types
- **Config** (`midlane.config.js`): datasource URL and schema location
- **CLI** (`midlane validate`, `midlane generate`): validation and code generation
- **Generated Client** (`MidlaneClient`): typed API calls with mapping support

## Getting started

### Quickstart (5min)

#### 1) Install

```bash
npm install midlane
```

#### 2) Create `midlane.config.js`

```js
import "dotenv/config";
import { defineConfig } from "midlane/config";

export default defineConfig({
  datasource: {
    url: process.env["API_URL"],
  },
  schema: "midlane/schema.midlane",
});
```

#### 3) Create `midlane/schema.midlane`

```txt
generator client {
  output = "../src/generated/midlane"
}

type User {
  id    Int    @map("usr_id")
  name  String @map("usr_name")
  email String @map("usr_mail")
}

type UserIdParams {
  id Int
}

type CreateUserBody {
  name  String @map("usr_name")
  email String @map("usr_mail")
}

resource Users {
  path = "/users"

  action List {
    path = "/"
    method = GET
    response = User[]
  }

  action GetById {
    path = "/:id"
    method = GET
    params = UserIdParams
    response = User
  }

  action Create {
    path = "/"
    method = POST
    body = CreateUserBody
    response = User
  }
}
```

#### 4) Validate and generate

```bash
npx midlane validate
npx midlane generate
```

#### 5) Use in your app

```ts
import { MidlaneClient } from "@/generated/midlane";

const midlane = new MidlaneClient({
  baseUrl: "https://api.example.com",
});

const users = await midlane.users.list();
const user = await midlane.users.getById({ params: { id: 1 } });
const created = await midlane.users.create({
  body: { name: "John", email: "john@mail.com" },
});
```

## How Midlane works

### The schema

The schema defines:

- **Generator output**: where the client should be generated
- **Types and enums**: your domain contract
- **Resources and actions**: API endpoints and operations

Naming rules:

- `resource` and `action` names must be `PascalCase`
- generated accessors are `camelCase` (`Users` -> `users`, `GetById` -> `getById`)
- `path` is required for both resources and actions

### Mapping with `@map`

`@map` renames fields between your internal domain and external API keys.

Example:

- App input: `{ name: "John" }`
- Outgoing payload: `{ "usr_name": "John" }`
- Incoming response: `{ "usr_name": "John" }`
- App output: `{ name: "John" }`

Mapping works for:

- `body`
- `query`
- `headers`
- `response`

It is recursive for nested objects and arrays.

### Config file

Midlane reads runtime configuration from `midlane.config.js`:

- `datasource.url`: base URL for generated client requests
- `schema`: path to `schema.midlane`

## CLI

```bash
midlane validate [schema]
midlane generate [schema]
```

Useful options:

- `--config <path>`: custom config path
- `--schema <path>`: custom schema path
- `--output <path>`: override generator output path

## Documentation

For now, this repository README is the main source of documentation.

## Support

- Open a bug report: <https://github.com/Cirilord/midlane/issues/new>
- Ask questions/discuss: <https://github.com/Cirilord/midlane/discussions>

## Contributing

PRs are welcome.

Before opening a PR, run:

```bash
yarn lint
yarn type-check
yarn test
```

## License

MIT
