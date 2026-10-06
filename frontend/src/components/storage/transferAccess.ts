export const rootKey = (instance:number, root:string) => `${instance}:${root}`;
export const rootChoices = (accesses:any[], instance:number, root:string) => accesses.filter(a => a.method === 'ssh' && a.roots.some((r:any) => r.arr_instance_id === instance && r.arr_root === root));
export function selectedRootAccess(form:any, accesses:any[], instance:number, root:string) {
 const choices = rootChoices(accesses, instance, root);
 const id = form.root_access_ids?.[rootKey(instance, root)];
 return id ? choices.find(a => a.id === id) : choices.length === 1 ? choices[0] : undefined;
}
export function sshCovered(form:any, accesses:any[]) {
 return (form.routes || []).every((r:any) => [...(r.source_roots || []),r.destination_root].filter(Boolean).every(root => Boolean(selectedRootAccess(form,accesses,r.arr_instance_id,root))));
}
