import {sql,type SQL} from 'drizzle-orm';
/** Rotate across businesses by their most recent durable claim, then take small
 * rounds within each business. Uses only stored state, so restarts do not reset
 * fairness. Selection never starts a send; conditional job claims still do. */
export function fairDueIds(condition:SQL|undefined){
 return sql`WITH due AS MATERIALIZED (
  SELECT automations.id,automations.owner_user_id,automations.scheduled_at,
    ROW_NUMBER() OVER(PARTITION BY automations.owner_user_id ORDER BY automations.scheduled_at,automations.id) AS turn
  FROM automations WHERE ${condition}
 ), owners AS MATERIALIZED (SELECT DISTINCT owner_user_id FROM due),
 service AS MATERIALIZED (
  SELECT owners.owner_user_id,(SELECT MAX(history.locked_at) FROM automations history WHERE history.owner_user_id=owners.owner_user_id) AS last_served
  FROM owners
 )
 SELECT due.id FROM due JOIN service USING(owner_user_id)
 ORDER BY due.turn,service.last_served NULLS FIRST,due.scheduled_at,due.id LIMIT 25`;
}
