import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LOGO_URL = "https://iwtgwsdufyvnzndkuilz.supabase.co/storage/v1/object/public/quote-assets/am-clean-logo-branca.png";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { quote_id } = await req.json();
    if (!quote_id) throw new Error("quote_id is required");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch quote with lead
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*, leads(*)")
      .eq("id", quote_id)
      .single();

    if (error || !quote) throw new Error("Quote not found");
    if (!quote.pdf_url) {
      console.log("[send-quote-email] PDF URL not set yet, skipping");
      return new Response(JSON.stringify({ ok: false, reason: "no_pdf" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lead = quote.leads;
    if (!lead?.email) {
      console.log("[send-quote-email] No email for lead, skipping email send");
      return new Response(JSON.stringify({ ok: false, reason: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyName = lead.company_name || lead.contact_name || lead.whatsapp_number || "Cliente";
    const contactName = lead.contact_name || lead.whatsapp_number || "";
    const lang = lead.language || "fr";
    const isFr = lang === "fr" || lang === "nl";

    const emailHtml = generateEmailHtml({
      companyName,
      contactName,
      pdfUrl: quote.pdf_url,
      isFr,
    });

    // Send via Resend API
    const emailResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AM Clean <info@amclean.be>",
        to: [lead.email],
        subject: isFr
          ? `Votre proposition commerciale — AM Clean`
          : `Sua proposta comercial — AM Clean`,
        html: emailHtml,
      }),
    });

    if (!emailResp.ok) {
      const errText = await emailResp.text();
      console.error("[send-quote-email] Email send error:", errText);
      // Don't throw - log and continue
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-quote-email] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface EmailData {
  companyName: string;
  contactName: string;
  pdfUrl: string;
  isFr: boolean;
}

function generateEmailHtml(data: EmailData): string {
  const { companyName, contactName, pdfUrl, isFr } = data;

  const t = isFr ? {
    title: "Votre proposition commerciale — AM Clean",
    coverBand: `À partir de maintenant, le nettoyage n'est plus un problème de <strong style="color:#ffffff;">${companyName}</strong>. <span style="color:rgba(255,255,255,0.45);"> — C'est l'engagement d'AM Clean.</span>`,
    kpi1: "Entreprises", kpi2: "Ans d'expérience", kpi3: "Rétention", kpi4: "Disponibilité",
    secTag: "Votre proposition personnalisée",
    heading: `+500 entreprises ont fait confiance.<br/>+7 ans de livraison.<br/><span style="color:#7B8DA3; font-weight:400;">98% sont restées. C'est maintenant au tour de ${companyName}.</span>`,
    greeting: "Madame, Monsieur,",
    greetText: `Nous vous remercions de l'opportunité de visiter <strong style="color:#0B2444;">${companyName}</strong> et de découvrir de près la réalité de votre espace.`,
    proposalText: `Suite à notre visite, nous avons préparé une <strong style="color:#0B2444;">proposition commerciale personnalisée</strong> — élaborée spécifiquement en fonction de ce que nous avons observé dans votre environnement, de votre type d'utilisation et des particularités de votre secteur.`,
    infoBox: `<strong style="color:#0B2444;">AM Clean</strong> est spécialiste du nettoyage professionnel pour les entreprises en Belgique. Nous opérons avec un <strong style="color:#0B2444;">contrat sur mesure</strong>, une facturation officielle à chaque prestation, <strong style="color:#0B2444;">produits inclus</strong>, une équipe formée et multilingue (FR/NL/EN), une disponibilité <strong style="color:#0B2444;">24h/24, 7j/7</strong> et une couverture sur toute la Belgique.`,
    ctaTag: "Prochaine étape",
    ctaTitle: `Votre proposition complète est prête.<br/><span style="color:#7B8DA3; font-weight:400; font-size:16px;">Consultez-la en un clic.</span>`,
    ctaText: `Nous avons préparé un document complet avec le diagnostic de votre espace, notre plan d'intervention personnalisé, le détail des services inclus et les conditions d'investissement. Tout y est — clair et détaillé.`,
    ctaBtn: "↓   Télécharger la proposition PDF",
    ctaNote: `Le document s'ouvrira directement dans votre navigateur.<br/>Vous pouvez également l'enregistrer pour le partager en interne.`,
    pullQuote: `"Ce sera un privilège de prendre soin de votre espace."`,
    nextSteps: `Ce qu'il faut faire maintenant est simple.`,
    nextSteps2: `Une réponse. Un <strong style="color:#0B2444;">"oui, on commence."</strong>`,
    nextSteps3: `À partir de là, nous nous occupons de tout. Nous définissons ensemble la meilleure date de démarrage, nous organisons l'équipe, préparons les produits spécifiques pour votre espace — et en quelques jours, <strong style="color:#0B2444;">${companyName}</strong> fonctionnera selon un standard entièrement différent. <strong style="color:#0B2444;">Vous n'avez rien de plus à régler. Il suffit de nous donner le signal.</strong>`,
    sigGreet: "Avec nos meilleures salutations,",
    sigRole: "Nettoyage Professionnel — Belgique",
    docTag: "Proposition Commerciale",
    footerConf: "Ce message est confidentiel et destiné uniquement à son destinataire.",
  } : {
    title: "Sua proposta comercial — AM Clean",
    coverBand: `A partir de agora, limpeza não é mais problema da <strong style="color:#ffffff;">${companyName}</strong>. <span style="color:rgba(255,255,255,0.45);"> — É compromisso da AM Clean.</span>`,
    kpi1: "Empresas", kpi2: "Anos de experiência", kpi3: "Retenção", kpi4: "Disponibilidade",
    secTag: "Sua proposta personalizada",
    heading: `+500 empresas confiaram.<br/>+7 anos entregando.<br/><span style="color:#7B8DA3; font-weight:400;">98% ficaram. Agora é a vez da ${companyName}.</span>`,
    greeting: `Prezado(a) ${contactName},`,
    greetText: `Agradecemos a oportunidade de visitar a <strong style="color:#0B2444;">${companyName}</strong> e conhecer de perto a realidade do seu espaço.`,
    proposalText: `Após a nossa visita, preparamos uma <strong style="color:#0B2444;">proposta comercial personalizada</strong> — elaborada especificamente com base no que observamos no seu ambiente, no tipo de uso e nas particularidades do seu setor.`,
    infoBox: `A <strong style="color:#0B2444;">AM Clean</strong> é especialista em limpeza profissional para empresas na Bélgica. Operamos com <strong style="color:#0B2444;">contrato sob medida</strong>, fatura oficial em cada serviço, <strong style="color:#0B2444;">produtos inclusos</strong>, equipe treinada e multilíngue (FR/NL/EN), disponibilidade <strong style="color:#0B2444;">24h/24, 7/7</strong> e cobertura em toda a Bélgica.`,
    ctaTag: "Próximo passo",
    ctaTitle: `A sua proposta completa está pronta.<br/><span style="color:#7B8DA3; font-weight:400; font-size:16px;">Consulte com um clique.</span>`,
    ctaText: `Preparamos um documento completo com o diagnóstico do seu espaço, o nosso plano de intervenção personalizado, o detalhe dos serviços incluídos e as condições de investimento.`,
    ctaBtn: "↓   Descarregar a proposta PDF",
    ctaNote: `O documento abrirá diretamente no seu navegador.<br/>Pode também guardá-lo para partilhar internamente.`,
    pullQuote: `"Vai ser um privilégio cuidar do seu espaço."`,
    nextSteps: `O que precisa acontecer agora é simples.`,
    nextSteps2: `Uma resposta. Um <strong style="color:#0B2444;">"sim, vamos começar."</strong>`,
    nextSteps3: `A partir daí, nós cuidamos de tudo. Definimos a melhor data juntos, organizamos a equipe, preparamos os produtos específicos para o seu espaço — e em poucos dias, <strong style="color:#0B2444;">${companyName}</strong> já vai operar num padrão completamente diferente. <strong style="color:#0B2444;">Não precisa resolver mais nada. Só nos dar o sinal.</strong>`,
    sigGreet: "Com os melhores cumprimentos,",
    sigRole: "Limpeza Profissional — Bélgica",
    docTag: "Proposta Comercial",
    footerConf: "Esta mensagem é confidencial e destinada apenas ao seu destinatário.",
  };

  return `<!DOCTYPE html>
<html lang="${isFr ? "fr" : "pt"}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t.title}</title>
</head>
<body style="margin:0; padding:0; background-color:#EAEEF4; font-family:'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EAEEF4; padding: 40px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px; width:100%; background:#ffffff; border-radius:4px; overflow:hidden; box-shadow: 0 4px 24px rgba(11,36,68,0.10);">

        <!-- HEADER -->
        <tr><td style="background-color:#0B2444; padding: 32px 48px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td><img src="${LOGO_URL}" alt="AM Clean" style="height:40px; width:auto;" /></td>
              <td align="right" style="vertical-align:bottom;">
                <span style="font-size:9px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,0.30);">${t.docTag}</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- COVER BAND -->
        <tr><td style="background-color:#1C3A5E; border-top:3px solid #2563A8; padding: 18px 48px;">
          <p style="margin:0; font-size:14px; font-weight:500; color:rgba(255,255,255,0.88); line-height:1.5;">${t.coverBand}</p>
        </td></tr>

        <!-- KPI BAR -->
        <tr><td style="background:#ffffff; border-bottom:1px solid #DDE4EE;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="25%" align="center" style="padding:20px 0; border-right:1px solid #DDE4EE;">
              <div style="font-size:26px; font-weight:900; color:#0B2444; line-height:1;"><sup style="font-size:13px; color:#2563A8;">+</sup>500</div>
              <div style="font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#7B8DA3; margin-top:5px;">${t.kpi1}</div>
            </td>
            <td width="25%" align="center" style="padding:20px 0; border-right:1px solid #DDE4EE;">
              <div style="font-size:26px; font-weight:900; color:#0B2444; line-height:1;"><sup style="font-size:13px; color:#2563A8;">+</sup>7</div>
              <div style="font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#7B8DA3; margin-top:5px;">${t.kpi2}</div>
            </td>
            <td width="25%" align="center" style="padding:20px 0; border-right:1px solid #DDE4EE;">
              <div style="font-size:26px; font-weight:900; color:#0B2444; line-height:1;">98<sup style="font-size:13px; color:#2563A8;">%</sup></div>
              <div style="font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#7B8DA3; margin-top:5px;">${t.kpi3}</div>
            </td>
            <td width="25%" align="center" style="padding:20px 0;">
              <div style="font-size:26px; font-weight:900; color:#0B2444; line-height:1;">24<sup style="font-size:13px; color:#2563A8;">/7</sup></div>
              <div style="font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#7B8DA3; margin-top:5px;">${t.kpi4}</div>
            </td>
          </tr></table>
        </td></tr>

        <!-- GREETING -->
        <tr><td style="padding: 40px 48px 0px;">
          <p style="margin:0 0 16px 0; font-size:9px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#2563A8;">${t.secTag}</p>
          <h1 style="margin:0 0 24px 0; font-size:22px; font-weight:800; color:#0B2444; line-height:1.25;">${t.heading}</h1>
          <p style="margin:0 0 14px 0; font-size:13.5px; color:#3A4F66; line-height:1.75;">${t.greeting}</p>
          <p style="margin:0 0 14px 0; font-size:13.5px; color:#3A4F66; line-height:1.75;">${t.greetText}</p>
          <p style="margin:0 0 14px 0; font-size:13.5px; color:#3A4F66; line-height:1.75;">${t.proposalText}</p>
        </td></tr>

        <!-- INFO BOX -->
        <tr><td style="padding: 16px 48px 0px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #C8D3E0; border-left:3px solid #2563A8; background:#F6F8FB;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0; font-size:13px; color:#3A4F66; line-height:1.75;">${t.infoBox}</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- FEATURES 2x2 -->
        <tr><td style="padding: 20px 48px 0px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DDE4EE;">
            <tr>
              <td width="50%" style="padding:16px 18px; border-right:1px solid #DDE4EE; border-bottom:1px solid #DDE4EE; vertical-align:top;">
                <span style="font-size:16px; opacity:0.75;">📋</span>
                <strong style="display:block; font-size:12.5px; color:#0B2444; margin: 4px 0 2px;">${isFr ? "Contrat sur mesure" : "Contrato sob medida"}</strong>
                <span style="font-size:12px; color:#7B8DA3;">${isFr ? "Adapté à la réalité de votre espace" : "Adaptado à realidade do seu espaço"}</span>
              </td>
              <td width="50%" style="padding:16px 18px; border-bottom:1px solid #DDE4EE; vertical-align:top;">
                <span style="font-size:16px; opacity:0.75;">🧾</span>
                <strong style="display:block; font-size:12.5px; color:#0B2444; margin: 4px 0 2px;">${isFr ? "Facturation officielle" : "Fatura oficial"}</strong>
                <span style="font-size:12px; color:#7B8DA3;">${isFr ? "À chaque prestation effectuée" : "Em cada serviço prestado"}</span>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding:16px 18px; border-right:1px solid #DDE4EE; vertical-align:top;">
                <span style="font-size:16px; opacity:0.75;">🧴</span>
                <strong style="display:block; font-size:12.5px; color:#0B2444; margin: 4px 0 2px;">${isFr ? "Produits inclus" : "Produtos inclusos"}</strong>
                <span style="font-size:12px; color:#7B8DA3;">${isFr ? "Adaptés à chaque surface" : "Corretos para cada superfície"}</span>
              </td>
              <td width="50%" style="padding:16px 18px; vertical-align:top;">
                <span style="font-size:16px; opacity:0.75;">🌍</span>
                <strong style="display:block; font-size:12.5px; color:#0B2444; margin: 4px 0 2px;">${isFr ? "Équipe multilingue" : "Equipe multilíngue"}</strong>
                <span style="font-size:12px; color:#7B8DA3;">FR / NL / EN</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- CTA BLOCK -->
        <tr><td style="padding: 36px 48px 0px;">
          <div style="height:1px; background:#DDE4EE; margin-bottom:32px;"></div>
          <p style="margin:0 0 8px 0; font-size:9px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#2563A8;">${t.ctaTag}</p>
          <h2 style="margin:0 0 14px 0; font-size:19px; font-weight:800; color:#0B2444; line-height:1.3;">${t.ctaTitle}</h2>
          <p style="margin:0 0 28px 0; font-size:13.5px; color:#3A4F66; line-height:1.75;">${t.ctaText}</p>
          <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
            <tr><td style="background-color:#0B2444; border-radius:3px;">
              <a href="${pdfUrl}" target="_blank" style="display:inline-block; padding:16px 40px; font-size:13.5px; font-weight:800; color:#ffffff; text-decoration:none; letter-spacing:0.3px; border-radius:3px;">${t.ctaBtn}</a>
            </td></tr>
          </table>
          <p style="margin:0; font-size:11px; color:#7B8DA3; line-height:1.6;">${t.ctaNote}</p>
        </td></tr>

        <!-- PULL QUOTE -->
        <tr><td style="padding: 28px 48px 0px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:4px solid #0B2444; background:#F6F8FB;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0; font-size:14px; font-weight:600; color:#0B2444; line-height:1.55;">${t.pullQuote}</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- NEXT STEPS -->
        <tr><td style="padding: 28px 48px 0px;">
          <p style="margin:0 0 14px 0; font-size:13.5px; color:#3A4F66; line-height:1.75;">${t.nextSteps}</p>
          <p style="margin:0 0 14px 0; font-size:13.5px; color:#3A4F66; line-height:1.75;">${t.nextSteps2}</p>
          <p style="margin:0; font-size:13.5px; color:#3A4F66; line-height:1.75;">${t.nextSteps3}</p>
        </td></tr>

        <!-- SIGNATURE -->
        <tr><td style="padding: 36px 48px 0px;">
          <div style="height:1px; background:#DDE4EE; margin-bottom:28px;"></div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:top;" width="50%">
              <p style="margin:0 0 4px 0; font-size:12.5px; color:#7B8DA3;">${t.sigGreet}</p>
              <p style="margin:0 0 2px 0; font-size:18px; font-weight:800; color:#0B2444;">AM Clean</p>
              <p style="margin:0 0 20px 0; font-size:12px; color:#7B8DA3;">${t.sigRole}</p>
              <div style="width:140px; height:1px; background:#C8D3E0; margin-bottom:8px;"></div>
              <p style="margin:0; font-size:11px; color:#7B8DA3; line-height:1.8;">TVA: BE 0766.610.794</p>
            </td>
            <td style="vertical-align:bottom;" width="50%">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:8px 0; border-bottom:1px solid #DDE4EE; font-size:12px; color:#3A4F66;">✉ <a href="mailto:info@amclean.be" style="color:#2563A8; text-decoration:none; font-weight:500;">info@amclean.be</a></td></tr>
                <tr><td style="padding:8px 0; border-bottom:1px solid #DDE4EE; font-size:12px; color:#3A4F66;">☎ 0470 68 27 25 (NL/FR)</td></tr>
                <tr><td style="padding:8px 0; border-bottom:1px solid #DDE4EE; font-size:12px; color:#3A4F66;">☎ 0477 92 09 61 (FR)</td></tr>
                <tr><td style="padding:8px 0; font-size:12px; color:#3A4F66;">🌐 <a href="https://www.amclean.be" style="color:#2563A8; text-decoration:none; font-weight:500;">amclean.be</a></td></tr>
              </table>
            </td>
          </tr></table>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#F6F8FB; border-top:1px solid #DDE4EE; padding: 16px 48px; margin-top:32px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td><img src="${LOGO_URL}" alt="AM Clean" style="height:24px; width:auto; opacity:0.4;" /></td>
            <td align="right">
              <p style="margin:0; font-size:10.5px; color:#7B8DA3; line-height:1.8; text-align:right;">
                TVA: BE 0766.610.794 · amclean.be<br/>
                <span style="font-size:10px; color:#C8D3E0;">${t.footerConf}</span>
              </p>
            </td>
          </tr></table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
