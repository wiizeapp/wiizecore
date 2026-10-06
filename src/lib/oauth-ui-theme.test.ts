import { describe, expect, it } from "vitest";
import { parseOAuthUiTheme, themeFromOAuthReturnPath } from "./oauth-ui-theme";

describe("tema visual do OAuth", () => {
  it("aceita somente light e dark", () => {
    expect(parseOAuthUiTheme("light")).toBe("light");
    expect(parseOAuthUiTheme("dark")).toBe("dark");
    expect(parseOAuthUiTheme("system")).toBeUndefined();
    expect(parseOAuthUiTheme("DARK")).toBeUndefined();
  });

  it("preserva o tema dentro do retorno seguro da tela de acesso", () => {
    expect(themeFromOAuthReturnPath("/oauth/authorize?state=x&ui_theme=dark")).toBe("dark");
    expect(themeFromOAuthReturnPath("/painel?ui_theme=dark")).toBeUndefined();
  });

});
