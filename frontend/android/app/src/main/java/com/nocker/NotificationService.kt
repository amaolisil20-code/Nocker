package com.nocker.app

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import org.json.JSONObject
import java.util.regex.Pattern

class NotificationService : NotificationListenerService() {

    companion object {
        private const val TAG = "NockerNotifService"
        var reactContext: ReactApplicationContext? = null

        // Padrões para detectar valores monetários
        val MONEY_PATTERNS = listOf(
            Pattern.compile("R\\$\\s*([\\d.,]+)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("([\\d.,]+)\\s*reais", Pattern.CASE_INSENSITIVE),
            Pattern.compile("valor[:\\s]+R?\\$?\\s*([\\d.,]+)", Pattern.CASE_INSENSITIVE),
        )

        // Bancos conhecidos e seus package names
        val BANK_PACKAGES = mapOf(
            "com.nu.production" to "Nubank",
            "br.com.intermedium" to "Inter",
            "com.bradesco" to "Bradesco",
            "br.com.itau" to "Itaú",
            "br.com.bb.android" to "Banco do Brasil",
            "com.santander.br" to "Santander",
            "br.com.c6bank.app" to "C6 Bank",
            "com.picpay" to "PicPay",
            "com.mercadopago.wallet" to "Mercado Pago",
            "br.com.recargapay.app" to "RecargaPay",
            "br.com.original.bank" to "Banco Original",
            "br.com.sicoob" to "Sicoob",
            "com.pagbank" to "PagBank",
        )

        // Palavras que indicam ENTRADA (receita)
        val INCOME_KEYWORDS = listOf(
            "recebeu", "recebido", "recebemos", "você recebeu",
            "pix recebido", "transferência recebida", "crédito",
            "depósito", "cashback", "estorno", "devolução",
        )

        // Palavras que indicam SAÍDA (despesa)
        val EXPENSE_KEYWORDS = listOf(
            "pagou", "pago", "pagamento", "débito", "debitado",
            "compra", "transferência enviada", "pix enviado",
            "enviou", "enviado", "transação", "consumo",
        )
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        val pkg = sbn.packageName ?: return
        val bankName = BANK_PACKAGES[pkg] ?: return // Ignora apps que não são bancos

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val title = extras.getString("android.title") ?: ""
        val text = extras.getString("android.text") ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""

        val fullText = "$title $text $bigText".trim()

        Log.d(TAG, "Notificação de $bankName: $fullText")

        val amount = extractAmount(fullText) ?: return // Sem valor monetário, ignora
        val type = detectType(fullText)
        val description = buildDescription(title, text, bankName)

        // Envia para o React Native via módulo
        try {
            val ctx = reactContext ?: return
            NotificationModule.sendTransactionEvent(ctx, JSONObject().apply {
                put("amount", amount)
                put("type", type)
                put("description", description)
                put("bank", bankName)
                put("raw", fullText)
            })
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar evento: ${e.message}")
        }
    }

    private fun extractAmount(text: String): Double? {
        for (pattern in MONEY_PATTERNS) {
            val matcher = pattern.matcher(text)
            if (matcher.find()) {
                val raw = matcher.group(1) ?: continue
                // Remove pontos de milhar e troca vírgula por ponto
                val cleaned = raw.replace(".", "").replace(",", ".")
                return cleaned.toDoubleOrNull()
            }
        }
        return null
    }

    private fun detectType(text: String): String {
        val lower = text.lowercase()
        for (kw in INCOME_KEYWORDS) {
            if (lower.contains(kw)) return "income"
        }
        for (kw in EXPENSE_KEYWORDS) {
            if (lower.contains(kw)) return "expense"
        }
        return "expense" // padrão
    }

    private fun buildDescription(title: String, text: String, bank: String): String {
        val t = title.ifBlank { text }.ifBlank { bank }
        return t.take(80) // máximo 80 chars
    }
}