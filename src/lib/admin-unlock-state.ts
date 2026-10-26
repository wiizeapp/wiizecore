// Only the volatile proof lives here; authorization always happens on the server.
let proof: string | null = null;
export const getAdminProof = () => proof;
export const setAdminProof = (value: string | null) => { proof = value; };