import { client } from '../lib/client'
const n = await client.fetch(`count(*[])`)
console.log(`token works, ${n} documents readable`)
