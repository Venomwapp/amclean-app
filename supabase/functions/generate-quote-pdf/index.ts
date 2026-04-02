import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const LOGO_URL = "https://iwtgwsdufyvnzndkuilz.supabase.co/storage/v1/object/public/quote-assets/am-clean-logo-branca.png";

const NAVY = rgb(11 / 255, 36 / 255, 68 / 255);
const NAVY2 = rgb(28 / 255, 58 / 255, 94 / 255);
const BLUE = rgb(37 / 255, 99 / 255, 168 / 255);
const GRAY500 = rgb(123 / 255, 141 / 255, 163 / 255);
const GRAY700 = rgb(58 / 255, 79 / 255, 102 / 255);
const WHITE = rgb(1, 1, 1);
const GRAY100 = rgb(246 / 255, 248 / 255, 251 / 255);
const LINE = rgb(221 / 255, 228 / 255, 238 / 255);

serve(async (req) => {
  console.log("[generate-quote-pdf] Function invoked");
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const quote_id = body.quote_id;
    if (!quote_id) throw new Error("quote_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*, leads(*)")
      .eq("id", quote_id)
      .single();

    if (error || !quote) throw new Error("Quote not found: " + (error?.message || "null"));

    const lead = quote.leads;
    const companyName = lead?.company_name || lead?.contact_name || lead?.whatsapp_number || "Cliente";
    const contactName = lead?.contact_name || lead?.whatsapp_number || "Prezado(a)";
    const items = (quote.items as any[]) || [];
    const total = quote.total_amount || 0;
    const description = quote.description || "";
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()}`;
    const refNum = `PROP-${today.getFullYear()}/${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`;

    const lang = lead?.language || "fr";
    const isFr = lang === "fr" || lang === "nl";
    const t = getTexts(isFr, companyName, contactName);

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Try to embed logo
    let logoImage: any = null;
    try {
      const logoResp = await fetch(LOGO_URL);
      const logoBytes = new Uint8Array(await logoResp.arrayBuffer());
      logoImage = await pdfDoc.embedPng(logoBytes);
    } catch (e) {
      console.warn("[generate-quote-pdf] Could not embed logo:", e.message);
    }

    const W = 595.28; // A4 width
    const H = 841.89; // A4 height
    const MARGIN = 50;
    const CW = W - MARGIN * 2; // content width

    let page = pdfDoc.addPage([W, H]);
    let y = H;

    // ── HEADER (navy bar) ──
    const headerH = 90;
    page.drawRectangle({ x: 0, y: H - headerH, width: W, height: headerH, color: NAVY });

    if (logoImage) {
      const logoH = 36;
      const logoW = (logoImage.width / logoImage.height) * logoH;
      page.drawImage(logoImage, { x: MARGIN, y: H - headerH + (headerH - logoH) / 2, width: logoW, height: logoH });
    }

    // Right side header text
    page.drawText(t.docTag.toUpperCase(), { x: W - MARGIN - fontRegular.widthOfTextAtSize(t.docTag.toUpperCase(), 8), y: H - 30, size: 8, font: fontRegular, color: rgb(1, 1, 1, 0.4) });
    const forText = `${t.forLabel} ${companyName}`;
    page.drawText(forText, { x: W - MARGIN - fontBold.widthOfTextAtSize(forText, 14), y: H - 48, size: 14, font: fontBold, color: WHITE });
    const metaText = `${t.dateLabel} ${dateStr}  |  ${t.refLabel} ${refNum}`;
    page.drawText(metaText, { x: W - MARGIN - fontRegular.widthOfTextAtSize(metaText, 9), y: H - 66, size: 9, font: fontRegular, color: rgb(1, 1, 1, 0.45) });

    y = H - headerH;

    // ── BLUE ACCENT LINE ──
    page.drawRectangle({ x: 0, y: y - 3, width: W, height: 3, color: BLUE });
    y -= 3;

    // ── COVER BAND ──
    const bandH = 40;
    page.drawRectangle({ x: 0, y: y - bandH, width: W, height: bandH, color: NAVY2 });
    const coverText = isFr
      ? `A partir de maintenant, le nettoyage n'est plus un probleme de ${companyName}. C'est l'engagement d'AM Clean.`
      : `A partir de agora, limpeza nao e mais problema da ${companyName}. E compromisso da AM Clean.`;
    page.drawText(coverText, { x: MARGIN, y: y - bandH + 14, size: 10, font: fontRegular, color: rgb(1, 1, 1, 0.85), maxWidth: CW });
    y -= bandH;

    // ── KPI BAR ──
    const kpiH = 55;
    page.drawRectangle({ x: 0, y: y - kpiH, width: W, height: kpiH, color: WHITE });
    page.drawLine({ start: { x: 0, y: y - kpiH }, end: { x: W, y: y - kpiH }, thickness: 0.5, color: LINE });

    const kpis = [
      { n: "+500", l: t.kpi1 }, { n: "+7", l: t.kpi2 }, { n: "98%", l: t.kpi3 }, { n: "24/7", l: t.kpi4 }
    ];
    const kpiW = W / 4;
    kpis.forEach((kpi, i) => {
      const cx = kpiW * i + kpiW / 2;
      const nw = fontBold.widthOfTextAtSize(kpi.n, 22);
      page.drawText(kpi.n, { x: cx - nw / 2, y: y - 28, size: 22, font: fontBold, color: NAVY });
      const lw = fontRegular.widthOfTextAtSize(kpi.l.toUpperCase(), 7);
      page.drawText(kpi.l.toUpperCase(), { x: cx - lw / 2, y: y - 42, size: 7, font: fontRegular, color: GRAY500 });
      if (i < 3) page.drawLine({ start: { x: kpiW * (i + 1), y: y }, end: { x: kpiW * (i + 1), y: y - kpiH }, thickness: 0.5, color: LINE });
    });
    y -= kpiH;

    // ── PRESENTATION SECTION ──
    y -= 30;
    page.drawText(t.sec1Tag.toUpperCase(), { x: MARGIN, y, size: 8, font: fontBold, color: BLUE });
    y -= 20;

    const presentTitle = isFr
      ? `+500 entreprises ont fait confiance. +7 ans de livraison. 98% sont restees.`
      : `+500 empresas confiaram. +7 anos entregando. 98% ficaram.`;
    page.drawText(presentTitle, { x: MARGIN, y, size: 14, font: fontBold, color: NAVY, maxWidth: CW });
    y -= 30;

    const greetText = isFr
      ? `Nous vous remercions de l'opportunite de visiter ${companyName} et de decouvrir de pres la realite de votre espace.`
      : `Agradecemos a oportunidade de visitar a ${companyName} e conhecer de perto a realidade do seu espaco.`;
    page.drawText(greetText, { x: MARGIN, y, size: 10, font: fontRegular, color: GRAY700, maxWidth: CW, lineHeight: 14 });
    y -= 40;

    const proposalText = isFr
      ? `Suite a notre visite, nous avons prepare une proposition commerciale personnalisee, elaboree specifiquement en fonction de ce que nous avons observe dans votre environnement.`
      : `Apos a nossa visita, preparamos uma proposta comercial personalizada, elaborada especificamente com base no que observamos no seu ambiente.`;
    page.drawText(proposalText, { x: MARGIN, y, size: 10, font: fontRegular, color: GRAY700, maxWidth: CW, lineHeight: 14 });
    y -= 40;

    // Info box
    const infoBoxH = 50;
    page.drawRectangle({ x: MARGIN, y: y - infoBoxH, width: CW, height: infoBoxH, color: GRAY100, borderColor: LINE, borderWidth: 1 });
    page.drawRectangle({ x: MARGIN, y: y - infoBoxH, width: 3, height: infoBoxH, color: BLUE });
    const infoText = isFr
      ? `AM Clean est specialiste du nettoyage professionnel pour les entreprises en Belgique. Contrat sur mesure, facture officielle, produits inclus, equipe multilingue (FR/NL/EN), disponibilite 24h/24, 7j/7.`
      : `A AM Clean e especialista em limpeza profissional para empresas na Belgica. Contrato sob medida, fatura oficial, produtos inclusos, equipe multilingue (FR/NL/EN), disponibilidade 24h/24, 7/7.`;
    page.drawText(infoText, { x: MARGIN + 12, y: y - 16, size: 9, font: fontRegular, color: GRAY700, maxWidth: CW - 24, lineHeight: 13 });
    y -= infoBoxH + 20;

    // ── DESCRIPTION (if any) ──
    if (description) {
      page.drawText(isFr ? "02 — DESCRIPTION" : "02 — DESCRICAO", { x: MARGIN, y, size: 8, font: fontBold, color: BLUE });
      y -= 18;
      page.drawText(description, { x: MARGIN, y, size: 11, font: fontBold, color: NAVY, maxWidth: CW, lineHeight: 15 });
      y -= 30;
    }

    // ── SERVICES TABLE ──
    page.drawText(t.sec4Tag.toUpperCase(), { x: MARGIN, y, size: 8, font: fontBold, color: BLUE });
    y -= 25;

    // Table header bar
    const tableHeaderH = 28;
    page.drawRectangle({ x: MARGIN, y: y - tableHeaderH, width: CW, height: tableHeaderH, color: NAVY });
    page.drawText(t.servHeader, { x: MARGIN + 12, y: y - 18, size: 10, font: fontBold, color: WHITE });
    y -= tableHeaderH;

    // Column headers
    const colHeaderH = 22;
    page.drawRectangle({ x: MARGIN, y: y - colHeaderH, width: CW, height: colHeaderH, color: GRAY100, borderColor: LINE, borderWidth: 0.5 });
    const col1X = MARGIN + 10;
    const col2X = MARGIN + CW * 0.35;
    const col3X = MARGIN + CW * 0.75;
    page.drawText(t.thService.toUpperCase(), { x: col1X, y: y - 15, size: 7, font: fontBold, color: GRAY500 });
    page.drawText(t.thDesc.toUpperCase(), { x: col2X, y: y - 15, size: 7, font: fontBold, color: GRAY500 });
    page.drawText(t.thFreq.toUpperCase(), { x: col3X, y: y - 15, size: 7, font: fontBold, color: GRAY500 });
    y -= colHeaderH;

    // Table rows
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowH = 24;

      // Check if we need a new page
      if (y - rowH < 120) {
        page = pdfDoc.addPage([W, H]);
        y = H - MARGIN;
      }

      if (i % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: y - rowH, width: CW, height: rowH, color: GRAY100 });
      }
      page.drawLine({ start: { x: MARGIN, y: y - rowH }, end: { x: MARGIN + CW, y: y - rowH }, thickness: 0.5, color: LINE });

      page.drawText(String(item.service || ""), { x: col1X, y: y - 16, size: 9, font: fontBold, color: NAVY, maxWidth: CW * 0.3 });
      page.drawText(String(item.details || ""), { x: col2X, y: y - 16, size: 9, font: fontRegular, color: GRAY700, maxWidth: CW * 0.35 });
      page.drawText(String(item.frequency || (isFr ? "Mensuel" : "Mensal")), { x: col3X, y: y - 16, size: 9, font: fontRegular, color: GRAY700 });
      y -= rowH;
    }

    y -= 25;

    // ── PRICING SECTION ──
    if (y < 220) {
      page = pdfDoc.addPage([W, H]);
      y = H - MARGIN;
    }

    page.drawText(t.sec5Tag.toUpperCase(), { x: MARGIN, y, size: 8, font: fontBold, color: BLUE });
    y -= 25;

    // Price panel
    const priceH = 120;
    const leftW = CW * 0.45;
    const rightW = CW * 0.55;

    // Left panel (navy with total)
    page.drawRectangle({ x: MARGIN, y: y - priceH, width: leftW, height: priceH, color: NAVY });
    page.drawText(t.investLabel.toUpperCase(), { x: MARGIN + 16, y: y - 25, size: 7, font: fontBold, color: rgb(1, 1, 1, 0.35) });
    const totalStr = `€${total.toFixed(2)}`;
    page.drawText(totalStr, { x: MARGIN + 16, y: y - 65, size: 32, font: fontBold, color: WHITE });
    page.drawText(t.perPeriod, { x: MARGIN + 16, y: y - 85, size: 9, font: fontRegular, color: rgb(1, 1, 1, 0.45) });

    // Right panel (breakdown)
    page.drawRectangle({ x: MARGIN + leftW, y: y - priceH, width: rightW, height: priceH, color: GRAY100, borderColor: LINE, borderWidth: 0.5 });
    page.drawText(t.summaryTitle.toUpperCase(), { x: MARGIN + leftW + 14, y: y - 20, size: 7, font: fontBold, color: GRAY500 });

    let priceY = y - 38;
    for (const item of items) {
      const svc = String(item.service || "");
      const price = `€${(item.price || 0).toFixed(2)}`;
      page.drawText(svc, { x: MARGIN + leftW + 14, y: priceY, size: 9, font: fontRegular, color: GRAY700 });
      page.drawText(price, { x: MARGIN + CW - 14 - fontBold.widthOfTextAtSize(price, 9), y: priceY, size: 9, font: fontBold, color: NAVY });
      priceY -= 16;
    }

    // Total line
    page.drawLine({ start: { x: MARGIN + leftW + 14, y: priceY + 2 }, end: { x: MARGIN + CW - 14, y: priceY + 2 }, thickness: 1.5, color: NAVY });
    priceY -= 8;
    page.drawText("Total", { x: MARGIN + leftW + 14, y: priceY, size: 10, font: fontBold, color: NAVY });
    const totalPriceStr = `€${total.toFixed(2)}`;
    page.drawText(totalPriceStr, { x: MARGIN + CW - 14 - fontBold.widthOfTextAtSize(totalPriceStr, 12), y: priceY, size: 12, font: fontBold, color: NAVY });

    y -= priceH + 25;

    // ── CTA SECTION ──
    if (y < 180) {
      page = pdfDoc.addPage([W, H]);
      y = H - MARGIN;
    }

    const ctaH = 140;
    page.drawRectangle({ x: 0, y: y - ctaH, width: W, height: ctaH, color: NAVY });
    page.drawText(t.ctaTag.toUpperCase(), { x: MARGIN, y: y - 25, size: 8, font: fontBold, color: rgb(1, 1, 1, 0.3) });

    const ctaTitle = isFr ? "Un mot de votre part. Nous faisons le reste." : "Uma palavra sua. A gente faz o resto.";
    page.drawText(ctaTitle, { x: MARGIN, y: y - 50, size: 18, font: fontBold, color: WHITE, maxWidth: CW * 0.7 });

    const ctaText = isFr
      ? `Ce qu'il faut faire maintenant est simple. Une reponse. Un "oui, on commence."`
      : `O que precisa acontecer agora e simples. Uma resposta. Um "sim, vamos comecar."`;
    page.drawText(ctaText, { x: MARGIN, y: y - 80, size: 10, font: fontRegular, color: rgb(1, 1, 1, 0.6), maxWidth: CW * 0.75, lineHeight: 14 });

    page.drawText(t.ctaNote, { x: MARGIN, y: y - ctaH + 15, size: 8, font: fontRegular, color: rgb(1, 1, 1, 0.25) });
    y -= ctaH + 20;

    // ── SIGNATURE ──
    if (y < 120) {
      page = pdfDoc.addPage([W, H]);
      y = H - MARGIN;
    }

    page.drawText(t.sigGreet, { x: MARGIN, y, size: 10, font: fontRegular, color: GRAY500 });
    y -= 18;
    page.drawText("AM Clean", { x: MARGIN, y, size: 16, font: fontBold, color: NAVY });
    y -= 16;
    page.drawText(t.sigRole, { x: MARGIN, y, size: 9, font: fontRegular, color: GRAY500 });
    y -= 12;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 120, y }, thickness: 0.5, color: LINE });
    y -= 14;
    page.drawText("TVA: BE 0766.610.794", { x: MARGIN, y, size: 8, font: fontRegular, color: GRAY500 });

    // Contact info on right
    const rightX = W - MARGIN - 140;
    page.drawText("info@amclean.be", { x: rightX, y: y + 40, size: 9, font: fontRegular, color: BLUE });
    page.drawText("0470 68 27 25 (NL/FR)", { x: rightX, y: y + 26, size: 9, font: fontRegular, color: GRAY700 });
    page.drawText("0477 92 09 61 (FR)", { x: rightX, y: y + 12, size: 9, font: fontRegular, color: GRAY700 });
    page.drawText("amclean.be", { x: rightX, y: y - 2, size: 9, font: fontRegular, color: BLUE });

    // ── FOOTER ──
    page.drawRectangle({ x: 0, y: 0, width: W, height: 30, color: GRAY100 });
    page.drawLine({ start: { x: 0, y: 30 }, end: { x: W, y: 30 }, thickness: 0.5, color: LINE });
    page.drawText("TVA: BE 0766.610.794  ·  amclean.be", { x: W - MARGIN - fontRegular.widthOfTextAtSize("TVA: BE 0766.610.794  ·  amclean.be", 8), y: 10, size: 8, font: fontRegular, color: GRAY500 });

    if (logoImage) {
      const fLogoH = 16;
      const fLogoW = (logoImage.width / logoImage.height) * fLogoH;
      page.drawImage(logoImage, { x: MARGIN, y: 7, width: fLogoW, height: fLogoH, opacity: 0.4 });
    }

    // Save PDF bytes
    const pdfBytes = await pdfDoc.save();
    console.log("[generate-quote-pdf] PDF generated, size:", pdfBytes.length, "bytes");

    // Upload to storage — use company/client name in filename
    const safeName = (companyName || contactName || "cliente")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      .toLowerCase().slice(0, 50);
    const fileName = `proposta-${safeName}-${quote_id.slice(0, 8)}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("quote-assets")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw new Error("Upload error: " + uploadError.message);

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/quote-assets/${fileName}`;

    await supabase.from("quotes").update({
      pdf_url: publicUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", quote_id);

    console.log("[generate-quote-pdf] Done! URL:", publicUrl);
    return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[generate-quote-pdf] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getTexts(isFr: boolean, companyName: string, contactName: string) {
  return isFr ? {
    docTag: "Proposition Commerciale",
    forLabel: "Pour :",
    dateLabel: "Date :",
    refLabel: "Ref. :",
    kpi1: "Entreprises", kpi2: "Ans d'experience", kpi3: "Retention", kpi4: "Disponibilite",
    sec1Tag: "01 — Presentation",
    sec4Tag: "04 — Scope du service",
    servHeader: "Detail des services inclus",
    thService: "Service", thDesc: "Description / Zone", thFreq: "Frequence",
    sec5Tag: "05 — Investissement",
    investLabel: "Investissement total",
    perPeriod: "par mois",
    ctaTag: "Prochaine Etape",
    ctaNote: "Ce sera un privilege de prendre soin de votre espace.",
    sigGreet: "Avec nos meilleures salutations,",
    sigRole: "AM Clean — Nettoyage Professionnel",
    summaryTitle: "Resume de la proposition",
  } : {
    docTag: "Proposta Comercial",
    forLabel: "Para:",
    dateLabel: "Data:",
    refLabel: "Ref.:",
    kpi1: "Empresas atendidas", kpi2: "Anos de experiencia", kpi3: "Taxa de retencao", kpi4: "Disponibilidade",
    sec1Tag: "01 — Apresentacao",
    sec4Tag: "04 — Escopo do servico",
    servHeader: "Detalhamento dos servicos incluidos",
    thService: "Servico", thDesc: "Descricao / Area", thFreq: "Frequencia",
    sec5Tag: "05 — Investimento",
    investLabel: "Investimento total",
    perPeriod: "por mes",
    ctaTag: "O Proximo Passo",
    ctaNote: "Vai ser um privilegio cuidar do seu espaco.",
    sigGreet: "Com os melhores cumprimentos,",
    sigRole: "AM Clean — Limpeza Profissional",
    summaryTitle: "Resumo da contratacao",
  };
}
