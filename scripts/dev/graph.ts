import { client } from '../lib/client'
const counts = await client.fetch(`{
  "cards": count(*[_type=="card"]),
  "printingsLinked": count(*[_type=="printing" && defined(card._ref)]),
  "diffsLinked": count(*[_type=="textDifference" && defined(card._ref) && defined(printing._ref)]),
  "claimsLinked": count(*[_type=="claim" && defined(subjectCard._ref)]),
  "eventsLinked": count(*[_type=="formatEvent" && defined(card._ref)]),
  "rulesSourced": count(*[_type=="ruleParagraph" && defined(source._ref)]),
  "glossarySourced": count(*[_type=="glossaryTerm" && defined(source._ref)]),
  "glossaryToRules": count(*[_type=="glossaryTerm" && count(rules) > 0]),
  "casesWithCards": count(*[_type=="adjudicationCase" && count(requiredCards) > 0]),
  "orphanPrintings": count(*[_type=="printing" && !defined(card._ref)]),
  "orphanClaims": count(*[_type=="claim" && !defined(subjectCard._ref)])
}`)
console.log(counts)
