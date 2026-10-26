#!/usr/bin/env python3
"""Build a compact, traceable Markdown inventory from the bundled OpenAPI file."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SPEC = ROOT / "references" / "stays-openapi.json"
DEFAULT_OUTPUT = ROOT / "references" / "endpoint-catalog.md"
METHODS = ("get", "post", "put", "patch", "delete", "options", "head")
READ_POSTS = {
    ("/booking/search-listings", "post"),
    ("/booking/calculate-price", "post"),
    ("/booking/reservations-export", "post"),
}
EXTERNAL_ACTIONS = {
    ("/book-request", "post"),
    ("/booking/reservations/{reserveId}/send-email", "post"),
    ("/smm/threads/{threadId}/messages", "post"),
    ("/notifications/push", "post"),
}
SENSITIVE_OPERATIONS = {("/core/exchange-token", "post")}


def resolve_ref(value: Any, document: dict[str, Any]) -> Any:
    """Resolve local JSON pointers while avoiding infinite reference loops."""
    seen: set[str] = set()
    while isinstance(value, dict) and "$ref" in value:
        ref = value["$ref"]
        if ref in seen or not ref.startswith("#/"):
            return value
        seen.add(ref)
        target: Any = document
        try:
            for part in ref[2:].split("/"):
                target = target[part.replace("~1", "/").replace("~0", "~")]
        except (KeyError, TypeError):
            return value
        value = target
    return value


def schema_description(schema: Any, document: dict[str, Any]) -> str:
    schema = resolve_ref(schema or {}, document)
    if not isinstance(schema, dict):
        return "unspecified"
    if "oneOf" in schema or "anyOf" in schema:
        variants = schema.get("oneOf", schema.get("anyOf", []))
        return "one of: " + "; ".join(schema_description(item, document) for item in variants)
    if "allOf" in schema:
        return " & ".join(schema_description(item, document) for item in schema["allOf"])
    kind = schema.get("type", "object" if "properties" in schema else "unspecified")
    if kind == "array":
        item = resolve_ref(schema.get("items", {}), document)
        if isinstance(item, dict) and item.get("enum"):
            return "array[" + "|".join(map(str, item["enum"])) + "]"
        return "array[" + schema_description(item, document) + "]"
    if schema.get("enum"):
        kind += " (" + "|".join(map(str, schema["enum"])) + ")"
    if schema.get("format"):
        kind += ", " + str(schema["format"])
    return kind


def property_summary(schema: Any, document: dict[str, Any]) -> str:
    schema = resolve_ref(schema or {}, document)
    if not isinstance(schema, dict):
        return ""
    if "oneOf" in schema or "anyOf" in schema:
        return schema_description(schema, document)
    if "allOf" in schema:
        merged_properties: dict[str, Any] = {}
        merged_required: set[str] = set()
        for part in schema["allOf"]:
            resolved_part = resolve_ref(part, document)
            if isinstance(resolved_part, dict):
                merged_properties.update(resolved_part.get("properties", {}))
                merged_required.update(resolved_part.get("required", []))
        if merged_properties:
            return ", ".join(
                f"`{name}`{'*' if name in merged_required else ''}:{schema_description(prop, document)}"
                for name, prop in merged_properties.items()
            )
        return schema_description(schema, document)
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    if properties:
        return ", ".join(
            f"`{name}`{'*' if name in required else ''}:{schema_description(prop, document)}"
            for name, prop in properties.items()
        )
    return schema_description(schema, document)


def effect_for(path: str, method: str) -> tuple[str, str]:
    key = (path, method)
    if key in SENSITIVE_OPERATIONS:
        return "sensitive", "credential/token operation; do not invoke without a specific request and secure handling"
    if key in EXTERNAL_ACTIONS:
        return "external action", "may create a checkout, send, or enqueue communication; confirm target and content"
    if key in READ_POSTS:
        return "read", "POST used as a query in this operation; validate its documented body"
    if method == "get" or method == "head":
        return "read", "retrieves data; minimize personal/financial fields in output"
    return "mutation", "changes persistent data; confirm target, scope, and final state"


def operation_rows(spec: dict[str, Any]) -> list[tuple[str, str, dict[str, Any]]]:
    rows = []
    for path, path_item in spec.get("paths", {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method.lower() in METHODS and isinstance(operation, dict):
                merged = dict(operation)
                inherited = path_item.get("parameters", [])
                local = operation.get("parameters", [])
                merged["parameters"] = list(inherited) + list(local)
                rows.append((path, method.lower(), merged))
    return rows


def render(spec: dict[str, Any]) -> str:
    rows = operation_rows(spec)
    tags: dict[str, list[tuple[str, str, dict[str, Any]]]] = {}
    for path, method, operation in rows:
        names = operation.get("tags") or ["Untagged"]
        for name in names:
            tags.setdefault(str(name), []).append((path, method, operation))

    lines = [
        "# Catálogo completo de endpoints",
        "",
        f"Inventário derivado de `references/stays-openapi.json` ({len(rows)} operações, {len(spec.get('paths', {}))} caminhos).",
        "`*` marca parâmetro/campo obrigatório conforme o snapshot. Um `?` ou schema vazio indica que o contrato não especificou o formato com detalhe suficiente; consulte Swagger da conta antes de integrar.",
        "",
        "**Efeito:** `read` consulta; `external action` pode iniciar checkout/enviar mensagem; `mutation` altera estado; `sensitive` envolve credencial/token. A classificação é uma triagem para leitura humana, não autorização. Verifique sempre descrição e schema: HTTP verb sozinho não determina o efeito.",
        "",
        "Para encontrar uma operação: `python3 scripts/inspect-openapi.py <termos>`. Para atualizar este arquivo após trocar o snapshot: `python3 scripts/build-endpoint-catalog.py`.",
        "",
        "## Índice por área",
        "",
    ]
    for tag in sorted(tags, key=str.casefold):
        lines.append(f"- [{tag}](#{tag.casefold().replace(' ', '-')}) — {len(tags[tag])} operações")

    for tag in sorted(tags, key=str.casefold):
        lines.extend(["", f"## {tag}", ""])
        for path, method, operation in sorted(tags[tag], key=lambda row: (row[0], METHODS.index(row[1]))):
            effect, note = effect_for(path, method)
            lines.append(f"### `{method.upper()} {path}`")
            summary = operation.get("summary") or operation.get("description", "").split("\n")[0] or "Sem resumo no contrato."
            lines.extend(["", str(summary).strip(), "", f"- **Efeito provável:** {effect} — {note}."])
            if operation.get("operationId"):
                lines.append(f"- **operationId:** `{operation['operationId']}`")

            parameters = []
            for parameter in operation.get("parameters", []):
                item = resolve_ref(parameter, spec)
                if not isinstance(item, dict):
                    continue
                schema = schema_description(item.get("schema", {}), spec)
                required = "*" if item.get("required") else ""
                description = (item.get("description") or "").replace("\n", " ").strip()
                parameters.append(f"`{item.get('name')}{required}` ({item.get('in', '?')}; {schema})" + (f" — {description}" if description else ""))
            if parameters:
                lines.append("- **Parâmetros:** " + "; ".join(parameters) + ".")
            elif "parameters" in operation:
                lines.append("- **Parâmetros:** nenhum listado na operação.")

            body = operation.get("requestBody")
            if body:
                body = resolve_ref(body, spec)
                media_types = []
                if isinstance(body, dict):
                    for media_type, media in body.get("content", {}).items():
                        schema = resolve_ref(media.get("schema", {}), spec)
                        media_types.append(f"`{media_type}`: {property_summary(schema, spec)}")
                required = "obrigatório" if isinstance(body, dict) and body.get("required") else "opcional"
                lines.append(f"- **Body ({required}):** " + ("; ".join(media_types) if media_types else "schema não detalhado") + ".")
            else:
                lines.append("- **Body:** não indicado no contrato.")

            response_bits = []
            for status, response in operation.get("responses", {}).items():
                response = resolve_ref(response, spec)
                if not isinstance(response, dict):
                    response_bits.append(f"{status}: schema não detalhado")
                    continue
                content = response.get("content", {})
                if not content:
                    response_bits.append(f"{status}: sem body/content documentado")
                    continue
                for media_type, media in content.items():
                    schema = resolve_ref(media.get("schema", {}), spec)
                    response_bits.append(f"{status} {media_type}: {property_summary(schema, spec)}")
            lines.append("- **Respostas:** " + ("; ".join(response_bits) if response_bits else "não documentadas") + ".")
            lines.append("")

    lines.extend([
        "## Confirmação para alterações",
        "",
        "- Consultas só precisam dos parâmetros necessários ao pedido; restrinja período e escopo.",
        "- Uma mudança pontual pode ser executada quando o pedido identifica claramente ação, entidade, valor e período, e a autorização está explícita.",
        "- Antes de alterações amplas — múltiplos anúncios/reservas/proprietários, regras globais, sincronização externa, configurações de pagamento/financeiro, lote de calendário, exclusão difícil de reverter ou comunicação em massa — prepare um plano concreto e peça confirmação explícita após mostrar alvo, escopo, valores/datas e efeitos esperados.",
        "- Depois da escrita, releia o recurso ou calendário afetado e reporte estado real. Se a resposta não confirmar o resultado, pare; não repita uma chamada não idempotente.",
        "",
        "Este catálogo não substitui o OpenAPI nem comprova permissões da conta. Schemas, enums, respostas e autorização podem mudar.",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", type=Path, default=DEFAULT_SPEC)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        spec = json.loads(args.spec.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        parser.error(f"cannot read OpenAPI file: {exc}")
    args.output.write_text(render(spec), encoding="utf-8")
    print(f"Generated catalog for {len(operation_rows(spec))} operations at {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
