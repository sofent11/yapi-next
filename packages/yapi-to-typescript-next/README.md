# yapi-to-typescript-next

Generate TypeScript request types and request helpers from YApi, Swagger, or OpenAPI definitions.

```ts
import { defineConfig } from 'yapi-to-typescript-next';

export default defineConfig([
  {
    serverUrl: 'http://127.0.0.1:3000',
    outputFilePath: interfaceInfo => `src/api/api_${interfaceInfo.catid}.ts`,
    requestFunctionFilePath: 'src/api/request.ts',
    dataKey: 'data',
    projects: [
      {
        token: process.env.YAPI_TOKEN || '',
        categories: [{ id: 0 }]
      }
    ]
  }
]);
```

Run with:

```bash
npx yttn -c yttn.config.ts
```
