"""Migra os tokens do Open Finance (bank_connections.provider_item_id) de
uma OF_TOKEN_KEY antiga para uma nova, sem derrubar as conexões bancárias já
existentes.

Por quê: a chave de criptografia dos tokens é derivada só de OF_TOKEN_KEY.
Trocá-la sem migração faz o servidor não conseguir mais descriptografar os
tokens já salvos (o usuário precisaria reconectar o banco). Este script
decripta cada registro com a chave configurada (nova ou, em fallback, uma das
OF_TOKEN_KEY_LEGACY) e regrava criptografado só com a chave nova.

Como usar (uma vez, com as credenciais de PRODUÇÃO):
  1. No ambiente onde for rodar o script, configure:
       OF_TOKEN_KEY        = <chave nova, forte>
       OF_TOKEN_KEY_LEGACY = <chave antiga, atualmente em uso>
       SUPABASE_URL / SUPABASE_KEY apontando para o Supabase de produção
  2. Rode:  python scripts/rotate_of_token_key.py
  3. Confira a saída (migradas / já atualizadas / falharam).
  4. Verifique que a sincronização bancária dos usuários continua normal.
  5. Só depois disso, remova OF_TOKEN_KEY_LEGACY do ambiente de produção
     (deixá-la seria manter uma chave antiga válida para descriptografar).

Este script MODIFICA DADOS REAIS. Rode com um backup do banco disponível.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import supabase, _encrypt_secret, _decrypt_secret  # noqa: E402


def main() -> None:
    rows = supabase.table("bank_connections").select("id, provider_item_id").execute().data or []
    migrated = skipped = failed = 0

    for row in rows:
        enc = row.get("provider_item_id")
        if not enc:
            skipped += 1
            continue

        plain = _decrypt_secret(enc)
        if not plain:
            failed += 1
            print(f"[FALHA] bank_connections.id={row['id']}: nenhuma chave configurada conseguiu descriptografar.")
            continue

        new_enc = _encrypt_secret(plain)
        if new_enc == enc:
            skipped += 1
            continue

        supabase.table("bank_connections").update({"provider_item_id": new_enc}).eq("id", row["id"]).execute()
        migrated += 1

    print(f"\nMigradas: {migrated} | Já atualizadas/sem token: {skipped} | Falharam: {failed}")
    if failed:
        print(
            "Atenção: os registros que falharam continuam com o token cifrado pela chave "
            "antiga e vão parar de sincronizar até serem corrigidos manualmente (o usuário "
            "reconectar o banco é o caminho mais simples nesse caso)."
        )


if __name__ == "__main__":
    main()
