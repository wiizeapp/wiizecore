import { expect, it } from "vitest";
import { assertIsolationDenied, isolationRows } from "./isolation-response";

it("recusa RLS explícita conta como acesso negado", async () => expect(await isolationRows(Response.json({ code: "42501" }, { status: 403 }))).toEqual([]));
it("tabela ausente nunca conta como isolamento aprovado", async () => await expect(isolationRows(Response.json({ code: "42P01" }, { status: 404 }))).rejects.toThrow());
it("erro de serviço nunca conta como isolamento aprovado", async () => await expect(isolationRows(Response.json({}, { status: 500 }))).rejects.toThrow());
it("sessão expirada não comprova isolamento", async () => await expect(isolationRows(Response.json({ code: "PGRST301" }, { status: 401 }))).rejects.toThrow());
it("escrita bem-sucedida nunca conta como negada", async () => await expect(assertIsolationDenied(Response.json([]))).rejects.toThrow());