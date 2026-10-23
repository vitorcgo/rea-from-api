// Usage example. Run: node examples/basic.ts
import { createClient } from "../src/index.ts";

const client = createClient({ logger: (line) => console.error(line) });

const data = await client.getPypiByProjectVersion({ project: "requests", version: "2.32.3" }, {});
console.log(JSON.stringify(data, null, 2).slice(0, 2000));
