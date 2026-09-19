import { client } from '../lib/client'
const s = await client.fetch(`{
  "total": count(*[_type=="decision"]),
  "human": count(*[_type=="decision" && confirmedByHuman == true]),
  "assisted": count(*[_type=="decision" && confirmedByHuman != true]),
  "functional": count(*[_type=="textDifference" && reviewState=="functional"]),
  "nonfunctional": count(*[_type=="textDifference" && reviewState=="nonfunctional"]),
  "unreviewed": count(*[_type=="textDifference" && reviewState=="unreviewed"])
}`)
console.log(s)
console.log(`\n${s.assisted}/${s.total} decisions are model-assisted drafts awaiting human confirmation.`)
console.log('The DEV post must state this number, not round it away.')
