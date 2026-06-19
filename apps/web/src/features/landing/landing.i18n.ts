import type { Dict } from '@/lib/i18n';

/**
 * Marketing copy for the public landing page. Separate from in-app dictionaries
 * so product strings and marketing strings evolve independently. No em-dashes by
 * editorial rule; use commas, periods, or parentheses instead.
 */
export const landingDict: Dict = {
  // Nav
  navFeatures: { id: 'Fitur', en: 'Features' },
  navSupervisor: { id: 'Supervisor', en: 'Supervisor' },
  navHow: { id: 'Cara kerja', en: 'How it works' },
  navModes: { id: 'Mode AI', en: 'AI modes' },
  navSignIn: { id: 'Masuk', en: 'Sign in' },
  skipToContent: { id: 'Lewati ke konten', en: 'Skip to content' },

  // Hero
  heroEyebrow: { id: 'Operasi AI yang tersupervisi', en: 'Supervised AI operations' },
  heroTitle: {
    id: 'Jalankan semua WhatsApp Sales & CS dari satu dashboard.',
    en: 'Run every WhatsApp Sales & CS account from one dashboard.',
  },
  heroSub: {
    id: 'AI membalas otomatis, Hermes meninjau setiap pesan berisiko sebelum terkirim, dan tim Anda bisa ambil alih kapan saja.',
    en: 'AI replies automatically, Hermes reviews every risky message before it sends, and your team can take over anytime.',
  },
  heroCta: { id: 'Masuk ke dashboard', en: 'Go to the dashboard' },
  heroSecondary: { id: 'Lihat cara kerjanya', en: 'See how it works' },
  heroNote: {
    id: 'Multi-akun. Human-in-the-loop. Setiap keputusan tercatat.',
    en: 'Multi-account. Human-in-the-loop. Every decision logged.',
  },

  // Hero preview (live component mock)
  pvAccount: { id: 'CS Jakarta 01', en: 'CS Jakarta 01' },
  pvCustomer: { id: 'Rina · Lead panas', en: 'Rina · Hot lead' },
  pvMsgCustomer: { id: 'Kak, kalau bayar DP hari ini bisa dikirim besok?', en: 'Hi, if I pay the deposit today can it ship tomorrow?' },
  pvMsgAi: { id: 'Bisa kak. DP 30% mengunci slot pengiriman besok. Saya kirim detailnya ya.', en: 'Yes. A 30% deposit locks tomorrow’s shipping slot. I’ll send the details.' },
  pvReviewing: { id: 'Hermes meninjau balasan', en: 'Hermes reviewing reply' },
  pvApproved: { id: 'Disetujui · risiko rendah', en: 'Approved · low risk' },
  pvNav: { id: 'Percakapan', en: 'Conversations' },
  pvLive: { id: 'Langsung', en: 'Live' },
  pvL2Snippet: { id: 'Stok ukuran L masih ada kak?', en: 'Is size L still in stock?' },
  pvL3Snippet: { id: 'Boleh minta katalog terbaru?', en: 'Can I get the latest catalog?' },
  pvIntel: { id: 'Intelijen', en: 'Intelligence' },
  pvLeadScore: { id: 'Skor lead', en: 'Lead score' },
  pvSentiment: { id: 'Sentimen', en: 'Sentiment' },
  pvSentimentValue: { id: 'Positif', en: 'Positive' },
  pvStage: { id: 'Tahap', en: 'Stage' },
  pvStageValue: { id: 'Negosiasi', en: 'Negotiation' },

  // Stats band (factual product/architecture figures, not adoption claims)
  stat1Label: { id: 'mode AI per percakapan', en: 'AI modes per conversation' },
  stat2Label: { id: 'keputusan tercatat & bisa diaudit', en: 'of decisions logged and auditable' },
  stat3Label: { id: 'lapisan kendali: AI + Hermes', en: 'control layers: AI plus Hermes' },
  stat4Label: { id: 'bahasa didukung, bisa diperluas', en: 'languages supported, extensible' },

  // Integrations
  intLabel: { id: 'Bekerja dengan tools yang sudah Anda pakai', en: 'Works with the tools you already use' },

  // Supervisor (mock video) section
  supEyebrow: { id: 'Hermes Supervisor', en: 'Hermes Supervisor' },
  supTitle: { id: 'Lapisan kendali di atas setiap bot.', en: 'A control layer above every bot.' },
  supBody: {
    id: 'Hermes membaca konteks percakapan, memberi skor kepercayaan dan risiko, lalu memutuskan: kirim, jadikan draft, atau minta admin ambil alih. Aturan deterministik menangkap kata kunci sensitif, LLM menilai sisanya.',
    en: 'Hermes reads conversation context, scores confidence and risk, then decides: send, hold as a draft, or ask an admin to take over. Deterministic rules catch sensitive keywords, the LLM judges the rest.',
  },
  supPoint1: { id: 'Skor kepercayaan & risiko per balasan', en: 'Confidence and risk score per reply' },
  supPoint2: { id: 'Gerbang pra-kirim untuk chat sensitif', en: 'Pre-send gate for sensitive chats' },
  supPoint3: { id: 'Audit pasca-kirim untuk chat rutin', en: 'Post-send audit for routine chats' },
  supDemo: { id: 'Lihat demo langsung lewat WhatsApp', en: 'See it live on WhatsApp' },
  revHeader: { id: 'Tinjauan Hermes', en: 'Hermes review' },
  revApprove: { id: 'Setujui', en: 'Approve' },
  revDraftLabel: { id: 'Draf AI', en: 'AI draft' },
  revConfidence: { id: 'Kepercayaan', en: 'Confidence' },
  revRisk: { id: 'Risiko', en: 'Risk' },
  revRiskLow: { id: 'Rendah', en: 'Low' },
  revReasonLabel: { id: 'Alasan', en: 'Reason' },
  revReason: { id: 'Sesuai info harga & pengiriman di basis pengetahuan. Tidak ada data sensitif.', en: 'Matches the pricing and shipping info in the knowledge base. No sensitive data.' },

  // AI engine
  aiTitle: { id: 'Mesin AI yang kuat, tetap terkendali dan jujur.', en: 'A powerful AI engine, kept honest and in control.' },
  aiSub: {
    id: 'AI yang menjawab dari pengetahuan Anda, bukan tebakan, dalam bahasa pelanggan, dengan model yang Anda pilih sendiri.',
    en: 'AI that answers from your knowledge, not guesses, in the customer’s language, on a model you choose.',
  },
  ai1Title: { id: 'Tidak pernah mengarang', en: 'It never makes things up' },
  ai1Body: { id: 'AI hanya menjawab dari basis pengetahuan Anda. Saat tidak tahu, ia konfirmasi ke admin, bukan menebak.', en: 'The AI answers only from your knowledge base. When it does not know, it checks with an admin instead of guessing.' },
  ai2Title: { id: 'Pakai model AI pilihan Anda', en: 'Run the AI model you choose' },
  ai2Body: { id: 'Kompatibel dengan endpoint OpenAI mana pun. Default Hermes dari Nous Research, ganti model lewat konfigurasi tanpa ubah kode.', en: 'Works with any OpenAI-compatible endpoint. Defaults to Nous Research Hermes; swap models in config, no code change.' },
  ai3Title: { id: 'Jawab dalam bahasa pelanggan', en: 'Replies in the customer’s language' },
  ai3Body: { id: 'Bahasa Indonesia, Inggris, dan lainnya. Atur per bot, prompt menyesuaikan otomatis.', en: 'Indonesian, English, and more. Set it per bot and the prompts adapt automatically.' },
  ai4Title: { id: 'Paham nada, sesuai persona', en: 'Reads the tone, stays on persona' },
  ai4Body: { id: 'Mendeteksi sentimen pelanggan dan menjawab dengan suara brand Anda, didukung pencarian pengetahuan hybrid.', en: 'Detects customer sentiment and answers in your brand’s voice, backed by hybrid knowledge retrieval.' },

  // Capabilities bento
  capEyebrow: { id: 'Satu workspace', en: 'One workspace' },
  capTitle: { id: 'Semua yang dibutuhkan tim sales & CS.', en: 'Everything a sales and CS team needs.' },
  cap1Title: { id: 'Inbox multi-akun', en: 'Multi-account inbox' },
  cap1Body: { id: 'Semua WhatsApp dalam satu antrian gaya WhatsApp Web, dengan status live.', en: 'Every WhatsApp account in one WhatsApp Web-style queue, with live status.' },
  cap2Title: { id: 'Lead scoring otomatis', en: 'Automatic lead scoring' },
  cap2Body: { id: 'Dingin sampai sangat panas, dipicu sinyal harga, stok, dan permintaan DP.', en: 'Cold to very hot, triggered by price, stock, and deposit signals.' },
  cap3Title: { id: 'Basis pengetahuan + RAG', en: 'Knowledge base with RAG' },
  cap3Body: { id: 'Edit pengetahuan, jawaban AI langsung berubah. Tanpa fabrikasi data.', en: 'Edit knowledge and AI answers change instantly. No fabricated data.' },
  cap4Title: { id: 'Campaign terkontrol', en: 'Controlled campaigns' },
  cap4Body: { id: 'Persetujuan, rate limit per akun, jeda manusiawi, dan exclude opt-out.', en: 'Approval, per-account rate limits, human-like delays, and opt-out exclusion.' },
  cap5Title: { id: 'Analitik closing', en: 'Closing analytics' },
  cap5Body: { id: 'Funnel konversi, atribusi per bot, dan rincian menang/kalah.', en: 'Conversion funnel, per-bot attribution, and win/loss breakdown.' },
  cap6Title: { id: 'Jejak audit penuh', en: 'Full audit trail' },
  cap6Body: { id: 'Setiap kirim, takeover, dan keputusan Hermes tercatat dan bisa diekspor.', en: 'Every send, takeover, and Hermes decision is logged and exportable.' },

  // How it works
  howEyebrow: { id: 'Mulai dalam tiga langkah', en: 'Live in three steps' },
  howTitle: { id: 'Hubungkan, latih, awasi.', en: 'Connect, train, supervise.' },
  how1Title: { id: 'Hubungkan akun', en: 'Connect accounts' },
  how1Body: { id: 'Scan QR Baileys. Sesi tersimpan, reconnect otomatis, anti-ban dengan jeda kirim.', en: 'Scan the Baileys QR. Sessions persist, reconnect automatically, anti-ban send delays.' },
  how2Title: { id: 'Latih persona', en: 'Train the persona' },
  how2Body: { id: 'Atur Soul/persona dan basis pengetahuan produk. AI menjawab sesuai brand Anda.', en: 'Set the Soul/persona and product knowledge base. AI answers on-brand.' },
  how3Title: { id: 'Awasi & skalakan', en: 'Supervise and scale' },
  how3Body: { id: 'Pilih mode AI per percakapan dan biarkan Hermes menjaga kualitas.', en: 'Pick an AI mode per conversation and let Hermes guard quality.' },

  // AI modes
  modeEyebrow: { id: 'Kendali per percakapan', en: 'Per-conversation control' },
  modeTitle: { id: 'Lima mode, dari penuh otomatis sampai manual.', en: 'Five modes, from fully automatic to manual.' },
  modeOnTitle: { id: 'AI ON', en: 'AI ON' },
  modeOnBody: { id: 'Bot membalas otomatis, Hermes mengaudit setelah kirim.', en: 'Bot replies automatically, Hermes audits after sending.' },
  modeDraftTitle: { id: 'AI DRAFT', en: 'AI DRAFT' },
  modeDraftBody: { id: 'Bot menyiapkan draft, admin yang mengirim.', en: 'Bot drafts the reply, an admin sends it.' },
  modeSupTitle: { id: 'AI SUPERVISED', en: 'AI SUPERVISED' },
  modeSupBody: { id: 'Hermes meninjau sebelum pesan terkirim.', en: 'Hermes reviews before the message goes out.' },
  modeOffTitle: { id: 'AI OFF', en: 'AI OFF' },
  modeOffBody: { id: 'Semua balasan ditangani manual oleh tim.', en: 'Every reply is handled manually by the team.' },
  modePausedTitle: { id: 'AI PAUSED', en: 'AI PAUSED' },
  modePausedBody: { id: 'Bot berhenti otomatis saat risiko terdeteksi.', en: 'The bot stops automatically when risk is detected.' },

  // Analytics showcase
  anaEyebrow: { id: 'Hasil yang terukur', en: 'Measurable results' },
  anaTitle: { id: 'Lihat apa yang benar-benar closing.', en: 'See what actually closes.' },
  anaSub: {
    id: 'Funnel konversi, atribusi per bot, dan rincian menang/kalah dalam satu tampilan. Setiap perpindahan tahap tercatat otomatis.',
    en: 'Conversion funnel, per-bot attribution, and win/loss in one view. Every stage transition is logged automatically.',
  },
  anaPoint1: { id: 'Konversi tiap tahap, dari lead masuk sampai closing', en: 'Conversion at each stage, from new lead to closing' },
  anaPoint2: { id: 'Bot dan persona mana yang paling banyak menutup deal', en: 'Which bots and personas close the most deals' },
  anaPoint3: { id: 'Alasan menang dan kalah, dengan tren harian', en: 'Why deals are won and lost, with a daily trend' },
  anaChartTitle: { id: 'Konversi per tahap', en: 'Conversion by stage' },
  anaWonLabel: { id: 'Closing minggu ini', en: 'Closed this week' },
  anaStgNew: { id: 'Baru', en: 'New' },
  anaStgWarm: { id: 'Hangat', en: 'Warm' },
  anaStgHot: { id: 'Panas', en: 'Hot' },
  anaStgClosing: { id: 'Closing', en: 'Closing' },
  anaStgWon: { id: 'Menang', en: 'Won' },

  // FAQ
  faqEyebrow: { id: 'Sebelum Anda bertanya', en: 'Before you ask' },
  faqTitle: { id: 'Pertanyaan yang biasa muncul lebih dulu.', en: 'The questions teams ask first.' },
  faq1Q: { id: 'Apakah akun WhatsApp saya aman dari blokir?', en: 'Will my WhatsApp accounts stay safe from bans?' },
  faq1A: { id: 'Setiap kirim memakai jeda manusiawi dan rate limit per akun, sesi tersimpan dengan reconnect otomatis, dan tidak ada pengiriman gaya broadcast. Campaign selalu lewat antrian terkontrol dengan persetujuan.', en: 'Every send uses human-like delays and per-account rate limits, sessions persist with auto-reconnect, and there are no broadcast-style blasts. Campaigns always run through a controlled, approved queue.' },
  faq2Q: { id: 'Bagaimana kalau AI salah kirim ke pelanggan?', en: 'What if the AI sends the wrong thing to a customer?' },
  faq2A: { id: 'Untuk chat sensitif, Hermes meninjau balasan sebelum terkirim dan bisa menahannya jadi draft, memblokir, atau meminta admin ambil alih. Saat risiko terdeteksi, AI berhenti otomatis.', en: 'For sensitive chats, Hermes reviews the reply before it sends and can hold it as a draft, block it, or hand off to an admin. When risk is detected, the AI pauses automatically.' },
  faq3Q: { id: 'Model AI apa yang dipakai, dan bisa diganti?', en: 'Which AI model does it use, and can I change it?' },
  faq3A: { id: 'Mesin AI kompatibel dengan endpoint OpenAI mana pun. Default-nya Hermes dari Nous Research, dan Anda bisa pindah ke model lain lewat konfigurasi tanpa mengubah kode.', en: 'The AI engine works with any OpenAI-compatible endpoint. It defaults to Nous Research Hermes, and you can switch to another model through configuration with no code change.' },
  faq4Q: { id: 'Bisa untuk banyak admin dengan peran berbeda?', en: 'Does it support multiple admins with different roles?' },
  faq4A: { id: 'Ya. Ada peran owner, supervisor, admin, dan viewer dengan hak akses berbeda, plus jejak audit untuk setiap tindakan.', en: 'Yes. There are owner, supervisor, admin, and viewer roles with distinct permissions, plus an audit trail for every action.' },

  // Primary conversion: chat on WhatsApp
  ctaWhatsapp: { id: 'Chat via WhatsApp', en: 'Chat on WhatsApp' },
  // Reciprocity (free trial) + regret-aversion (no commitment). Edit to match your real policy.
  ctaReassure: { id: 'Tertarik coba? DM kami untuk trial. Kami bantu pasang supervisornya di akun Anda, tanpa komitmen, berhenti kapan saja.', en: 'Want to try it? DM us for a trial. We help set up the supervisor on your accounts, no commitment, stop anytime.' },
  // Trial terms: BYOK or routed via you, customer covers AI usage.
  ctaTerms: { id: 'Syarat trial: pakai model AI Anda sendiri (BYOK), atau lewat kami tapi tagihan pemakaian AI tetap Anda tanggung.', en: 'Trial terms: bring your own AI model/key (BYOK), or route through us while you cover the AI usage bill.' },

  // Final CTA
  ctaEarly: { id: 'Jadi salah satu tim pertama yang pakai Hermes', en: 'Be one of the first teams on Hermes' },
  ctaTitle: { id: 'Siap mengendalikan operasi WhatsApp Anda?', en: 'Ready to take control of your WhatsApp operation?' },
  // Pratfall: own the newness instead of hiding it.
  ctaSub: { id: 'Kami masih baru, jadi kami buktikan langsung di akun Anda, bukan lewat logo pelanggan yang belum kami punya.', en: 'We are new, so we will prove it on your own accounts, not with customer logos we do not have yet.' },
  ctaButton: { id: 'Masuk ke dashboard', en: 'Go to the dashboard' },
  // Authority + liking + unity. Personalize with your real name/number when ready.
  founderNote: { id: 'Dibuat oleh operator yang menjalankan akun WhatsApp sales sungguhan, bukan vendor tanpa wajah.', en: 'Built by an operator who runs real WhatsApp sales accounts, not a faceless vendor.' },

  // Footer
  footTagline: { id: 'Pusat operasi AI yang tersupervisi dan terlacak untuk banyak akun WhatsApp.', en: 'A supervised, traceable AI operations hub for many WhatsApp accounts.' },
  footProduct: { id: 'Produk', en: 'Product' },
  footRights: { id: 'Dibuat untuk tim Sales & CS.', en: 'Built for Sales and CS teams.' },
};
