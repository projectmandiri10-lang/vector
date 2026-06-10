import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  AlertCircle,
  AtSign,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cloud,
  Code,
  Cpu,
  Crown,
  CreditCard,
  Cookie,
  Database,
  Download,
  Eye,
  FileDown,
  FileText,
  Gift,
  Github,
  Globe,
  Gavel,
  Heart,
  HelpCircle,
  Image as ImageIcon,
  Instagram,
  Layers,
  Lightbulb,
  Loader2,
  Lock,
  Mail,
  MapPinned,
  Menu,
  MessageSquareQuote,
  PenTool,
  PhoneCall,
  Quote,
  RefreshCw,
  Rocket,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Twitter,
  Youtube,
  UploadCloud,
  User,
  UserCheck,
  Users,
  Scale,
  Wand2,
  X,
  Zap
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { submitContactMessage } from '../lib/api.js';
import { IMAGE_RETOUCH_PRICE_IDR, READY_PROCESS_PRICE_IDR, formatRupiah } from '../lib/pricing.js';

const SUPPORT_PHONE = '085156861485';
const SUPPORT_WHATSAPP = SUPPORT_PHONE;
const SUPPORT_EMAIL_LABEL = 'Belum tersedia saat ini';

const heroStats = [
  { icon: Star, value: '500+', label: 'Logo Diproses', accent: 'text-chart-3' },
  { icon: Sparkles, value: '98%', label: 'Kepuasan', accent: 'text-primary' },
  { icon: Zap, value: '2', label: 'Mode Output', accent: 'text-chart-2' }
];

const howItWorks = [
  {
    number: '01',
    icon: UploadCloud,
    title: 'Upload Gambar',
    description: 'Upload foto logo kaos yang ingin di-redesign. Mendukung format PNG, JPG, WEBP.',
    detail: 'Drag and drop atau pilih file'
  },
  {
    number: '02',
    icon: Wand2,
    title: 'Pilih Mode',
    description: `AI Redesign Premium (${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)}) atau Vector Siap Proses (${formatRupiah(READY_PROCESS_PRICE_IDR)}).`,
    detail: 'Pilih output: Sablon atau Sticker'
  },
  {
    number: '03',
    icon: Download,
    title: 'Download Hasil',
    description: 'Dapatkan logo bersih siap sablon atau sticker dalam hitungan detik.',
    detail: 'High quality, siap cetak'
  }
];

const pricingCards = [
  {
    title: 'AI Redesign',
    price: IMAGE_RETOUCH_PRICE_IDR,
    description: 'Untuk gambar yang belum rapih, perlu analisis AI dan redesign ulang',
    icon: Sparkles,
    popular: true,
    features: ['AI Image-to-Image', 'Safety Check', 'Sablon + Sticker mode', 'High Quality Output', 'Hasil dalam 1-3 menit']
  },
  {
    title: 'Vector Siap Proses',
    price: READY_PROCESS_PRICE_IDR,
    description: 'Untuk file SVG vector murni yang diproses tanpa AI sebagai jalur separasi warna dan contour sticker',
    icon: Zap,
    popular: false,
    features: ['Direct Processing', 'Sablon + Sticker mode', 'High Quality Output', 'Fast Processing (30-60s)', 'Hemat budget']
  }
];

const creditPackages = [
  {
    name: 'Paket Basic',
    credits: 2,
    price: 5000,
    pricePerCredit: 5000,
    callout: 'Cukup untuk 1 AI Redesign atau 2 Vector Siap Proses.',
    aiRedesign: 1,
    readyToTrace: 2
  },
  {
    name: 'Paket Standard',
    credits: 4,
    price: 10000,
    pricePerCredit: 5000,
    aiRedesign: 2,
    readyToTrace: 4
  },
  {
    name: 'Paket Premium',
    credits: 10,
    price: 25000,
    pricePerCredit: 5000,
    highlight: true,
    aiRedesign: 5,
    readyToTrace: 10
  }
];

const testimonials = [
  {
    name: 'Budi Santoso',
    role: 'Pemilik Konveksi',
    initials: 'BS',
    quote: `Hasil redesign logonya sangat bersih dan siap sablon. Dulu saya harus bayar desainer lumayan mahal, sekarang cukup ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)} per gambar.`,
    rating: 5
  },
  {
    name: 'Siti Rahayu',
    role: 'Seller Kaos Online',
    initials: 'SR',
    quote:
      'Mode Vector Siap Proses sangat cocok untuk file vector yang tinggal dipisah warna dan dibuat contour sticker. Prosesnya cepat dan hasilnya memuaskan.',
    rating: 5
  },
  {
    name: 'Ahmad Fauzi',
    role: 'Desainer Freelance',
    initials: 'AF',
    quote:
      'Sebagai desainer, saya skeptis awalnya. Tapi hasil AI Redesign-nya benar-benar impresif dan menghemat banyak waktu.',
    rating: 5
  }
];

const faqItems = [
  {
    question: 'Apa itu AI Logo Redesign?',
    answer:
      'AI Logo Redesign adalah platform berbasis AI yang membantu Anda mengubah foto logo kaos menjadi desain bersih dan profesional yang siap untuk disablon atau dijadikan sticker.'
  },
  {
    question: 'Berapa harga per gambar?',
    answer:
      `Kami menawarkan dua mode harga: AI Redesign Premium seharga ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)} per gambar dan Vector Siap Proses seharga ${formatRupiah(READY_PROCESS_PRICE_IDR)} per gambar. Anda dapat membeli credit dalam paket melalui Shopee.`
  },
  {
    question: 'Apa perbedaan AI Redesign dan Vector Siap Proses?',
    answer:
      'AI Redesign Premium menggunakan image-to-image untuk menggambar ulang desain sulit. Vector Siap Proses memproses file SVG tanpa AI sebagai jalur vector-only, cocok untuk separasi warna dan contour sticker.'
  },
  {
    question: 'Format output apa saja?',
    answer:
      'Kami menyediakan dua mode output: Sablon untuk cetak sablon kaos dan Sticker untuk cetak sticker dengan detail tinggi.'
  },
  {
    question: 'Bagaimana cara membeli credit?',
    answer:
      'Anda dapat membeli credit melalui produk Shopee kami. Pilih paket credit yang sesuai, lalu setelah pembayaran dikonfirmasi, credit akan ditambahkan ke akun Anda.'
  },
  {
    question: 'Apakah ada credit gratis?',
    answer:
      'Ya. Setiap pengguna baru yang mendaftar akan mendapatkan 5 credit gratis untuk mencoba layanan kami.'
  },
  {
    question: 'Berapa lama proses gambar?',
    answer:
      'Mode Vector Siap Proses biasanya selesai dalam 30-60 detik. Mode AI Redesign membutuhkan waktu sekitar 1-3 menit.'
  },
  {
    question: 'Apakah gambar saya aman?',
    answer:
      'Keamanan data Anda adalah prioritas kami. Semua gambar diproses secara aman dan tidak akan dibagikan ke pihak ketiga.'
  }
];

const trustBadges = [
  { icon: ShieldCheck, text: 'Tanpa Kartu Kredit', subtext: 'Bayar via Shopee' },
  { icon: Gift, text: '5 Credit Gratis', subtext: 'Untuk pengguna baru' },
  { icon: Clock, text: 'Daftar 30 Detik', subtext: 'Proses instan' },
  { icon: Zap, text: 'Hasil Instan', subtext: 'Siap dalam hitungan detik' }
];

const socialLinks = [
  { label: 'Twitter', icon: Twitter, href: '#' },
  { label: 'Instagram', icon: Instagram, href: '#' },
  { label: 'YouTube', icon: Youtube, href: '#' },
  { label: 'GitHub', icon: Github, href: '#' }
];

const privacySections = [
  {
    icon: Eye,
    title: '1. Pendahuluan',
    content: [
      'Kebijakan Privasi ini menjelaskan bagaimana kami mengumpulkan, menggunakan, menyimpan, membagikan, dan melindungi informasi pribadi Anda saat Anda menggunakan platform kami.',
      'Dengan mengakses, membuat akun, mengunggah gambar, membeli credit, atau menggunakan layanan kami, Anda menyetujui praktik yang dijelaskan dalam Kebijakan Privasi ini.'
    ]
  },
  {
    icon: Database,
    title: '2. Informasi yang Kami Kumpulkan',
    subsections: [
      {
        subtitle: 'Informasi yang Anda Berikan',
        items: [
          'Nama lengkap, nama pengguna, dan alamat email',
          'Informasi akun, invoice, order ID, nominal top up, dan status pembayaran',
          'Gambar, file desain, dan instruksi yang Anda upload untuk diproses',
          'Bukti pembayaran, pesan dukungan, dan komunikasi Anda'
        ]
      },
      {
        subtitle: 'Informasi yang Dikumpulkan Otomatis',
        items: [
          'Alamat IP, jenis browser, sistem operasi, dan perangkat yang digunakan',
          'Halaman yang Anda kunjungi, waktu akses, log keamanan, dan aktivitas akun',
          'Data cookie dan teknologi serupa',
          'Data transaksi dari kanal pembayaran yang aktif, termasuk Midtrans atau penyedia pembayaran lain bila digunakan'
        ]
      }
    ]
  },
  {
    icon: Globe,
    title: '3. Bagaimana Kami Menggunakan Informasi Anda',
    list: [
      'Menyediakan, mengoperasikan, dan memelihara layanan kami',
      'Memproses gambar dan menghasilkan desain ulang',
      'Mengelola akun pengguna dan verifikasi',
      'Memproses top up credit, pembayaran, rekonsiliasi, refund, chargeback, dan dispute transaksi',
      'Menanggapi pertanyaan dan permintaan Anda',
      'Mencegah penipuan, penyalahgunaan, transaksi tidak sah, dan pelanggaran keamanan',
      'Memenuhi kewajiban hukum, audit, perpajakan, pembukuan, dan permintaan regulator yang sah'
    ]
  },
  {
    icon: ShieldCheck,
    title: '4. Pembagian Informasi',
    list: [
      'Penyedia layanan pihak ketiga yang membantu operasional platform, termasuk hosting, storage, email, analitik, dukungan pelanggan, dan pemrosesan gambar',
      'Midtrans, bank, e-wallet, payment network, marketplace, atau penyedia pembayaran lain sejauh diperlukan untuk memproses pembayaran, refund, chargeback, rekonsiliasi, dan pencegahan fraud',
      'Pihak berwenang, regulator, pengadilan, atau instansi pemerintah bila diwajibkan oleh hukum atau proses hukum yang sah',
      'Perlindungan hak, properti, keamanan platform, pengguna, atau publik',
      'Transaksi bisnis seperti akuisisi atau penggabungan'
    ]
  },
  {
    icon: Lock,
    title: '5. Keamanan Data',
    content: [
      'Kami menerapkan langkah-langkah keamanan teknis dan organisasi yang wajar untuk melindungi informasi pribadi Anda.',
      'Data pembayaran sensitif seperti nomor kartu penuh, CVV, PIN, atau kredensial pembayaran diproses oleh payment gateway atau kanal pembayaran yang berwenang; kami tidak menyimpan data tersebut di server aplikasi.',
      'Gambar yang diupload akan diproses untuk menghasilkan output desain dan dapat disimpan sementara atau di galeri akun sesuai kebutuhan layanan, dukungan, audit, atau penghapusan yang Anda minta.'
    ]
  },
  {
    icon: UserCheck,
    title: '6. Hak Anda',
    list: [
      'Hak akses atas informasi pribadi Anda',
      'Hak koreksi atas informasi yang tidak akurat',
      'Hak penghapusan dalam batas kewajiban hukum, pembukuan, audit, keamanan, dan penyelesaian sengketa transaksi',
      'Hak pembatasan pemrosesan data',
      'Hak portabilitas data',
      'Hak keberatan atas pemrosesan tertentu',
      'Hak menarik persetujuan dengan memahami bahwa beberapa layanan mungkin tidak dapat digunakan tanpa data yang diperlukan'
    ]
  },
  {
    icon: Cookie,
    title: '7. Cookie',
    list: [
      'Cookie esensial untuk autentikasi dan keamanan',
      'Cookie fungsional untuk mengingat preferensi',
      'Cookie analitik untuk memahami penggunaan',
      'Cookie pemasaran untuk relevansi iklan'
    ]
  },
  {
    icon: RefreshCw,
    title: '8. Perubahan Kebijakan',
    content: [
      'Kami dapat memperbarui Kebijakan Privasi ini sewaktu-waktu. Perubahan akan berlaku efektif segera setelah dipublikasikan.',
      'Jika perubahan bersifat material, kami dapat memberi pemberitahuan melalui halaman aplikasi, email, atau kanal komunikasi lain yang tersedia.'
    ]
  },
  {
    icon: Mail,
    title: '9. Kontak Kami',
    list: [`Telepon: ${SUPPORT_PHONE}`, `WhatsApp: ${SUPPORT_WHATSAPP}`, `Email: ${SUPPORT_EMAIL_LABEL}`],
    afterList: ['Kebijakan Privasi ini terakhir diperbarui pada 10 Juni 2026.']
  }
];

const termsSections = [
  {
    icon: BookOpen,
    title: '1. Ketentuan Umum',
    content: [
      'Syarat dan Ketentuan ini mengatur hubungan antara Anda dan kami dalam penggunaan layanan platform AI Logo Redesign.',
      'Dengan mendaftar, mengunggah gambar, membeli credit, melakukan pembayaran, atau menggunakan layanan kami, Anda dianggap telah membaca, memahami, dan menyetujui seluruh ketentuan ini sebagai persetujuan elektronik yang sah.'
    ]
  },
  {
    icon: Layers,
    title: '2. Definisi',
    list: [
      'Platform: situs web dan layanan AI Logo Redesign',
      'Pengguna: individu yang mendaftar dan menggunakan layanan',
      'Layanan: seluruh fitur AI Redesign dan Vector Siap Proses',
      'Credit: unit pembayaran untuk mengakses layanan',
      'Gambar: file yang diunggah untuk diproses',
      'Payment gateway: Midtrans atau penyedia pembayaran lain yang kami aktifkan untuk memproses transaksi'
    ]
  },
  {
    icon: Server,
    title: '3. Layanan',
    list: [
      `AI Redesign Premium: ${formatRupiah(IMAGE_RETOUCH_PRICE_IDR)} per gambar`,
      `Vector Siap Proses: ${formatRupiah(READY_PROCESS_PRICE_IDR)} per gambar`,
      'Download film separasi sablon tidak dikenakan biaya tambahan per warna',
      'Output sablon dan sticker',
      'Penyimpanan hasil pada galeri pribadi pengguna'
    ],
    afterList: ['Waktu pemrosesan bervariasi, Vector Siap Proses sekitar 30-60 detik dan AI Redesign sekitar 1-3 menit.']
  },
  {
    icon: Scale,
    title: '4. Hak dan Kewajiban Pengguna',
    subsections: [
      {
        subtitle: 'Hak Pengguna',
        items: ['Menggunakan layanan sesuai ketentuan', 'Mendapat 5 credit gratis saat mendaftar', 'Mengunduh hasil pemrosesan', 'Meminta penghapusan data pribadi']
      },
      {
        subtitle: 'Kewajiban Pengguna',
        items: [
          'Memberikan informasi yang akurat',
          'Menjaga kerahasiaan akun dan password',
          'Tidak menggunakan layanan untuk tujuan ilegal',
          'Tidak mengunggah konten yang melanggar hak pihak lain',
          'Memastikan Anda memiliki hak atau izin yang diperlukan atas logo, gambar, merek, atau materi yang diproses',
          'Tidak melakukan transaksi palsu, chargeback tidak sah, penyalahgunaan promo, atau percobaan fraud'
        ]
      }
    ]
  },
  {
    icon: CreditCard,
    title: '5. Sistem Credit dan Pembayaran',
    list: [
      'Setiap pengguna baru mendapatkan 5 credit gratis',
      'Credit dapat dibeli melalui kanal resmi yang tersedia, termasuk Shopee, transfer manual, Midtrans, atau payment gateway lain bila sudah diaktifkan',
      'Pembayaran dapat diproses oleh pihak ketiga seperti Midtrans, bank, e-wallet, payment network, marketplace, atau penyedia pembayaran terkait',
      'Dengan membayar melalui kanal pihak ketiga, pengguna juga tunduk pada syarat, kebijakan privasi, keamanan, biaya kanal, batas waktu pembayaran, dan status transaksi dari kanal tersebut',
      'Credit yang sudah dipakai untuk memproses gambar tidak dapat dikembalikan kecuali terjadi kegagalan sistem, transaksi ganda, layanan tidak tersedia, atau kondisi lain yang kami setujui setelah verifikasi',
      'Refund, pembatalan, chargeback, dan dispute mengikuti status pembayaran, bukti transaksi, dan ketentuan kanal pembayaran yang digunakan; pada payment gateway, proses refund umumnya hanya dapat dilakukan setelah transaksi berhasil atau settlement',
      'Credit tidak dapat ditransfer ke akun lain',
      'Credit memiliki masa berlaku 12 bulan'
    ]
  },
  {
    icon: Lightbulb,
    title: '6. Hak Kekayaan Intelektual',
    list: [
      'Hasil pemrosesan gambar menggunakan layanan kami menjadi milik pengguna',
      'Pengguna bertanggung jawab memastikan gambar tidak melanggar hak pihak lain',
      'Teknologi AI dan algoritma tetap menjadi hak kekayaan intelektual kami'
    ]
  },
  {
    icon: AlertCircle,
    title: '7. Batasan Tanggung Jawab',
    list: [
      'Kerugian akibat penggunaan atau ketidakmampuan menggunakan layanan',
      'Kualitas hasil yang tidak sesuai ekspektasi',
      'Kehilangan data akibat kegagalan teknis atau force majeure',
      'Keterlambatan, penolakan, biaya kanal, atau gangguan transaksi pada Shopee, Midtrans, bank, e-wallet, payment network, atau penyedia pembayaran lain',
      'Kerugian akibat pengguna mengunggah materi tanpa hak, izin, atau lisensi yang diperlukan'
    ]
  },
  {
    icon: Ban,
    title: '8. Penghentian Layanan',
    list: [
      'Melanggar syarat dan ketentuan',
      'Terlibat dalam aktivitas penipuan atau ilegal',
      'Menyalahgunakan platform',
      'Akun tidak aktif dalam jangka waktu panjang'
    ]
  },
  {
    icon: RefreshCw,
    title: '9. Perubahan Ketentuan',
    content: [
      'Kami dapat mengubah Syarat dan Ketentuan ini sewaktu-waktu. Perubahan berlaku efektif setelah dipublikasikan.',
      'Penggunaan layanan secara berkelanjutan setelah perubahan berarti Anda menyetujui ketentuan yang diperbarui.'
    ]
  },
  {
    icon: Gavel,
    title: '10. Hukum yang Berlaku',
    content: [
      'Syarat dan Ketentuan ini diatur dan ditafsirkan sesuai dengan hukum Republik Indonesia.',
      'Setiap sengketa akan diselesaikan melalui musyawarah mufakat terlebih dahulu.'
    ]
  },
  {
    icon: Mail,
    title: '11. Kontak',
    list: [`Telepon: ${SUPPORT_PHONE}`, `WhatsApp: ${SUPPORT_WHATSAPP}`, `Email: ${SUPPORT_EMAIL_LABEL}`],
    afterList: ['Syarat dan Ketentuan ini terakhir diperbarui pada 10 Juni 2026.']
  }
];

const contactFaq = [
  { question: 'Berapa lama proses AI Redesign?', answer: 'Biasanya 30 detik hingga 2 menit tergantung kompleksitas gambar.' },
  { question: 'Format gambar apa yang didukung?', answer: 'Kami mendukung JPG, PNG, dan WebP dengan ukuran maksimal 10MB.' },
  { question: 'Apakah credit bisa dikembalikan?', answer: 'Credit yang sudah digunakan tidak dapat dikembalikan kecuali jika proses gagal karena kesalahan sistem.' },
  { question: 'Bagaimana cara menghubungi support?', answer: `Anda bisa mengisi formulir di bawah atau menghubungi WhatsApp/telepon ${SUPPORT_PHONE}. Email support belum tersedia saat ini.` }
];

const contactSubjects = [
  { value: 'umum', label: 'Umum' },
  { value: 'teknis', label: 'Teknis' },
  { value: 'billing', label: 'Billing' },
  { value: 'lainnya', label: 'Lainnya' }
];

const aboutMissionVision = [
  {
    icon: Target,
    title: 'Misi Kami',
    description:
      'Menyediakan layanan redesain logo yang cepat, akurat, dan terjangkau untuk seluruh pelaku industri kaos di Indonesia melalui teknologi AI terdepan.'
  },
  {
    icon: Heart,
    title: 'Visi Kami',
    description:
      'Menjadi platform terdepan dalam transformasi digital industri sablon dan sticker di Indonesia, memberdayakan desainer dan pengusaha kecil.'
  }
];

const aboutStats = [
  { label: 'Pengguna Aktif', value: 2500, suffix: '+', icon: Users },
  { label: 'Gambar Diproses', value: 10000, suffix: '+', icon: ImageIcon },
  { label: 'Uptime', value: 99.9, suffix: '%', icon: ShieldCheck }
];

const aboutTimeline = [
  { date: 'Jan 2024', title: 'Konsep dan Riset', description: 'Memulai riset kebutuhan pasar dan mengembangkan konsep platform.', icon: Lightbulb },
  { date: 'Mar 2024', title: 'Pengembangan MVP', description: 'Membangun versi awal platform dengan fitur AI Redesign dasar.', icon: Rocket },
  { date: 'Jun 2024', title: 'Beta Testing', description: 'Meluncurkan versi beta ke pengguna awal dan mengumpulkan feedback.', icon: Users },
  { date: 'Sep 2024', title: 'Peluncuran Publik', description: 'Resmi meluncurkan platform dengan fitur AI Redesign dan Vector Siap Proses.', icon: Star },
  { date: 'Des 2024', title: '10.000 Gambar Diproses', description: 'Lebih dari 10.000 gambar berhasil diproses di platform.', icon: Trophy }
];

const aboutTechStack = [
  { icon: BrainCircuit, name: 'VLM', description: 'Menganalisis dan memahami gambar logo secara mendalam dengan AI' },
  { icon: Wand2, name: 'AI Image Generation', description: 'Menghasilkan desain ulang berkualitas tinggi dari gambar yang dianalisis' },
  { icon: ImageIcon, name: 'Image Processing Pipeline', description: 'Mengoptimalkan gambar untuk output siap sablon dan sticker' },
  { icon: Eye, name: 'Computer Vision', description: 'Mendeteksi elemen-elemen desain dalam gambar' },
  { icon: Cloud, name: 'Cloud Infrastructure', description: 'Infrastruktur cloud yang handal untuk pemrosesan cepat dan aman' },
  { icon: Code, name: 'Modern Web Stack', description: 'Platform modern yang cepat, aman, dan mudah digunakan' }
];

const aboutTeam = [
  { name: 'Ahmad Rizki', role: 'Founder & CEO', initials: 'AR' },
  { name: 'Sari Dewi', role: 'Head of AI Research', initials: 'SD' },
  { name: 'Budi Prasetyo', role: 'Lead Developer', initials: 'BP' },
  { name: 'Maya Putri', role: 'UI/UX Designer', initials: 'MP' }
];

function navigatePath(path, onNavigate) {
  if (typeof onNavigate === 'function') {
    onNavigate(path);
    return;
  }
  window.location.assign(path);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function scrollToId(id) {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function formatMiniRupiah(value) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(value || 0)}`;
}

function useCounter(target, enabled = true, duration = 1200) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        const startTime = performance.now();
        const animate = (now) => {
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(Math.round(target * eased));
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };
        requestAnimationFrame(animate);
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [duration, enabled, target]);

  return { count, ref };
}

function SectionHeader({ eyebrow, title, subtitle, id }) {
  return (
    <div className="text-center">
      {eyebrow && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/5 px-4 py-1.5 text-sm font-medium text-primary shadow-[0_0_0_1px_rgba(124,58,237,0.04)] backdrop-blur-sm">
          <Sparkles className="h-4 w-4" />
          {eyebrow}
        </div>
      )}
      <h2 id={id} className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
        <span className="gradient-text">{title}</span>
      </h2>
      {subtitle && <p className="mx-auto mt-4 max-w-2xl text-lg text-mutedForeground">{subtitle}</p>}
    </div>
  );
}

function PublicNav({ onStart, onNavigate }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = [
    { label: 'Beranda', id: 'beranda' },
    { label: 'Cara Kerja', id: 'how-it-works' },
    { label: 'Harga', id: 'pricing' },
    { label: 'FAQ', id: 'faq' }
  ];

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 10);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function handleStart() {
    setMobileOpen(false);
    if (typeof onStart === 'function') {
      onStart();
      return;
    }
    scrollToId('auth');
  }

  function handleSectionClick(id) {
    setMobileOpen(false);
    scrollToId(id);
  }

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-500 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/20 after:to-transparent ${
        scrolled ? 'glass-nav shadow-lg shadow-primary/5 after:opacity-100' : 'bg-transparent after:opacity-0'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={() => scrollToId('beranda')} className="flex items-center gap-2 text-left transition-opacity hover:opacity-80">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="gradient-text text-xl font-bold tracking-tight">AI Logo Redesign</span>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => handleSectionClick(link.id)}
              className="rounded-md px-3 py-2 text-sm font-medium text-mutedForeground transition hover:bg-white/5 hover:text-foreground"
            >
              {link.label}
            </button>
          ))}
          <div className="ml-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleStart}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition hover:bg-white/5"
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={handleStart}
              className="gradient-bg rounded-md px-3 py-2 text-sm font-medium text-white shadow-lg shadow-primary/20 transition hover:shadow-xl"
            >
              Daftar
            </button>
          </div>
        </nav>

        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition hover:bg-white/5 md:hidden"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/70 bg-[#090d18]/95 px-4 py-4 backdrop-blur md:hidden">
          <div className="flex flex-col gap-2">
            {links.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => handleSectionClick(link.id)}
                className="rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-medium text-foreground transition hover:border-primary/30 hover:bg-white/5"
              >
                {link.label}
              </button>
            ))}
            <button type="button" onClick={handleStart} className="rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-medium text-foreground transition hover:border-primary/30 hover:bg-white/5">
              Masuk
            </button>
            <button type="button" onClick={handleStart} className="gradient-bg rounded-xl px-4 py-3 text-left text-sm font-semibold text-white shadow-lg shadow-primary/20">
              Daftar
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function PublicFooter({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const helpLinks = [
    { label: 'FAQ', icon: HelpCircle, action: () => scrollToId('faq') },
    { label: 'Kontak', icon: Mail, action: () => navigatePath('/contact', onNavigate) },
    { label: 'Kebijakan Privasi', icon: ShieldCheck, action: () => navigatePath('/privacy', onNavigate) },
    { label: 'Syarat & Ketentuan', icon: FileText, action: () => navigatePath('/terms', onNavigate) },
    { label: 'Tentang Kami', icon: BookOpen, action: () => navigatePath('/about', onNavigate) }
  ];

  function handleSubscribe(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setEmail('');
    window.setTimeout(() => setSubscribed(false), 3000);
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <footer className="mt-auto overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-primary via-chart-2 to-chart-3" />
      <div className="landing-footer-shell relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold gradient-text">AI Logo Redesign</span>
            </div>
            <p className="text-sm leading-relaxed text-mutedForeground">
              Platform redesign logo berbasis AI terdepan di Indonesia. Ubah logo Anda menjadi desain modern dan profesional hanya dalam hitungan detik dengan kekuatan kecerdasan buatan.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Layanan</h3>
            <ul className="space-y-2 text-sm text-mutedForeground">
              <li><button type="button" onClick={() => scrollToId('pricing')} className="hover:text-primary">AI Redesign</button></li>
              <li><button type="button" onClick={() => scrollToId('pricing')} className="hover:text-primary">Vector Siap Proses</button></li>
              <li><button type="button" onClick={() => scrollToId('pricing')} className="hover:text-primary">Harga</button></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Bantuan</h3>
            <ul className="space-y-2">
              {helpLinks.map((link) => (
                <li key={link.label}>
                  <button
                    type="button"
                    onClick={link.action}
                    className="group flex items-center gap-2 text-sm text-mutedForeground transition-all hover:translate-x-1 hover:text-primary"
                  >
                    <span className="transition-transform group-hover:scale-110">
                      <link.icon className="h-4 w-4" />
                    </span>
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Ikuti Kami</h3>
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  onClick={(event) => event.preventDefault()}
                  aria-label={social.label}
                  title="Segera hadir"
                  className="group/social flex h-10 w-10 items-center justify-center rounded-full border border-border text-mutedForeground transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:border-primary hover:bg-primary/5 hover:text-primary hover:shadow-md hover:shadow-primary/10"
                >
                  <social.icon className="h-5 w-5 transition-all duration-300 group-hover/social:scale-110 group-hover/social:text-primary" />
                </a>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-mutedForeground">Dapatkan tips desain & update terbaru</p>
              {subscribed ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Berhasil berlangganan!
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mutedForeground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Email Anda"
                      className="min-w-0 w-full rounded-xl border border-border bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-primary to-chart-2 px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
                    <Send className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Kirim</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="my-8 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-mutedForeground">&copy; {new Date().getFullYear()} AI Logo Redesign. Hak cipta dilindungi.</p>
          <div className="flex items-center gap-4">
            <p className="flex items-center gap-1 text-xs text-mutedForeground">
              Made with <Heart className="inline h-3 w-3 fill-red-500 text-red-500" /> in Indonesia
            </p>
            <button
              type="button"
              onClick={scrollToTop}
              className="flex h-8 w-8 items-center justify-center rounded-full border bg-primary/10 text-primary transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:text-white hover:shadow-md hover:shadow-primary/20"
              aria-label="Kembali ke atas"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

function HeroSection({ onStart }) {
  const floatingBadges = [
    { label: 'AI Powered', icon: Sparkles, tone: 'text-primary border-primary/20', position: 'right-[8%] top-[12%] sm:right-[12%] sm:top-[15%]', delay: '0s' },
    { label: formatRupiah(IMAGE_RETOUCH_PRICE_IDR), icon: Zap, tone: 'text-chart-3 border-chart-3/20', position: 'left-[5%] top-[25%] sm:left-[8%] sm:top-[30%]', delay: '1.3s' },
    { label: '5 Credit Gratis', icon: Star, tone: 'text-chart-2 border-chart-2/20', position: 'right-[15%] bottom-[18%] sm:right-[18%] sm:bottom-[20%]', delay: '2.6s' }
  ];

  return (
    <section id="beranda" className="relative overflow-hidden py-20 sm:py-28 lg:py-36">
      <div className="pointer-events-none absolute inset-0">
        <div className="hero-gradient-pan absolute inset-0" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#7c3aed 1px, transparent 1px), linear-gradient(90deg, #7c3aed 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="animate-float absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[100px]" />
        <div className="animate-float absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-chart-2/10 blur-[120px]" style={{ animationDelay: '1.5s' }} />
        <div className="animate-float absolute left-1/2 top-1/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-chart-3/10 blur-[100px]" style={{ animationDelay: '2.5s' }} />
        <div className="animate-float absolute right-[5%] top-[10%] h-[300px] w-[300px] rounded-full bg-chart-4/10 blur-[80px]" style={{ animationDelay: '0.8s' }} />
        <div className="animate-float absolute bottom-[20%] left-[10%] h-[250px] w-[250px] rounded-full bg-primary/8 blur-[80px]" style={{ animationDelay: '3s' }} />
        <div className="absolute right-[15%] top-[20%] h-3 w-3 rounded-full bg-primary/30 animate-float" />
        <div className="absolute left-[20%] top-[60%] h-2 w-2 rounded-full bg-chart-3/40 animate-float" style={{ animationDelay: '0.5s' }} />
        <div className="absolute right-[30%] bottom-[25%] h-4 w-4 rounded-full bg-chart-2/20 animate-float" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/5 px-4 py-2 text-sm font-medium text-primary shadow-sm backdrop-blur animate-pulse-glow">
            <Sparkles className="h-4 w-4" />
            Didukung Teknologi AI Terbaru
          </div>

          <div className="pointer-events-none absolute inset-0 hidden sm:block">
            {floatingBadges.map((badge) => (
              <div key={badge.label} className={`animate-badge-float absolute ${badge.position}`} style={{ animationDelay: badge.delay }}>
                <span className={`glass-card inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg ${badge.tone}`}>
                  <badge.icon className="h-3 w-3" />
                  {badge.label}
                </span>
              </div>
            ))}
          </div>

          <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="gradient-text animate-gradient-text relative inline-block bg-[length:200%_200%]">
              Transformasi Logo Kaos Anda
              <span className="hero-shimmer pointer-events-none absolute inset-0 overflow-hidden">
                <span className="absolute inset-y-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{ width: '50%' }} />
              </span>
            </span>
            <br />
            <span className="text-foreground">Menjadi Desain Siap Sablon</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-mutedForeground sm:text-xl">
            Ubah foto logo kaos biasa menjadi desain bersih dan profesional yang siap untuk sablon atau sticker - hanya dalam hitungan detik dengan kekuatan AI.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={onStart}
              className="gradient-bg animate-pulse-glow inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-8 text-base font-semibold text-white shadow-lg shadow-primary/20 transition hover:shadow-xl"
            >
              Mulai Sekarang
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollToId('how-it-works')}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white px-8 text-base font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5"
            >
              Lihat Cara Kerja
            </button>
          </div>

          <div className="landing-showcase mt-12 w-full max-w-4xl overflow-hidden rounded-[28px] p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(96,165,250,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.6) 1px, transparent 1px)', backgroundSize: '42px 42px' }} />
            <div className="relative flex flex-col items-center gap-6 md:flex-row md:justify-center md:gap-10">
              <div className="landing-before flex h-40 w-full max-w-[230px] flex-col items-center justify-center rounded-[26px]">
                <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-dashed border-white/20 bg-white/5 text-mutedForeground">
                  <ImageIcon className="h-8 w-8" />
                </div>
                <p className="mt-4 text-lg font-semibold text-foreground">Sebelum</p>
              </div>

              <div className="landing-process-pill flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-2 text-white shadow-[0_0_35px_rgba(96,165,250,0.35)]">
                  <Wand2 className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium text-mutedForeground">AI Processing</p>
              </div>

              <div className="landing-after flex h-40 w-full max-w-[230px] flex-col items-center justify-center rounded-[26px]">
                <div className="flex h-24 w-24 items-center justify-center rounded-[28px] border border-primary/35 bg-primary/10 text-primary shadow-[0_0_32px_rgba(124,58,237,0.35)]">
                  <ImageIcon className="h-10 w-10" />
                </div>
                <p className="mt-4 text-lg font-semibold text-primary">Sesudah</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between text-xs text-mutedForeground">
              <span className="rounded-full border border-chart-3/20 bg-white/5 px-3 py-1 text-chart-3">{formatRupiah(IMAGE_RETOUCH_PRICE_IDR)}</span>
              <span className="rounded-full border border-primary/20 bg-white/5 px-3 py-1 text-primary">5 Credit Gratis</span>
            </div>
          </div>

          <div className="mt-10 grid w-full max-w-4xl gap-4 md:grid-cols-3">
            {heroStats.map((stat) => (
              <div key={stat.label} className="landing-stat-card glass-card rounded-2xl px-5 py-4 text-center">
                <stat.icon className={`mx-auto mb-3 h-5 w-5 ${stat.accent}`} />
                <div className={`text-3xl font-black tracking-tight ${stat.accent}`}>{stat.value}</div>
                <div className="mt-1 text-sm text-mutedForeground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({ step }) {
  const accentClass = step.number === '01' ? 'landing-step-cyan' : step.number === '02' ? 'landing-step-violet' : 'landing-step-amber';
  return (
    <div className={`landing-step-card glass-card group relative overflow-hidden rounded-3xl p-6 text-center transition-transform hover:-translate-y-1 ${accentClass}`}>
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-2 text-base font-bold text-white shadow-lg shadow-primary/20">
        {step.number}
      </div>
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/5 text-primary transition group-hover:scale-105">
        <step.icon className="h-9 w-9" />
      </div>
      <h3 className="mb-2 text-xl font-bold text-foreground">{step.title}</h3>
      <p className="mb-3 text-sm text-mutedForeground sm:text-base">{step.description}</p>
      <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-mutedForeground">
        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        {step.detail}
      </div>
    </div>
  );
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative overflow-hidden py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-1/3 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-20 bottom-1/3 h-40 w-40 rounded-full bg-chart-2/5 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="Mudah dan Cepat" title="Cara Kerja" subtitle="Tiga langkah mudah untuk mendapatkan logo kaos profesional" />
        <div className="relative mt-16">
          <div className="pointer-events-none absolute left-[10%] right-[10%] top-[190px] hidden h-px bg-gradient-to-r from-chart-2/25 via-primary/25 to-chart-3/25 lg:block" />
          <div className="grid gap-8 lg:grid-cols-3">
          {howItWorks.map((step) => (
            <StepCard key={step.number} step={step} />
          ))}
          </div>
        </div>
        <p className="mt-14 text-center text-sm text-mutedForeground">Seluruh proses berjalan otomatis - tidak perlu keahlian desain.</p>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="relative overflow-hidden py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-1/4 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />
        <div className="absolute -right-16 bottom-1/4 h-40 w-40 rounded-full bg-chart-2/5 blur-2xl" />
        <div className="absolute left-1/3 top-[10%] h-24 w-24 rounded-full bg-chart-3/5 blur-2xl" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="Harga Transparan" title="Harga Terjangkau" subtitle="Pilih mode yang sesuai dengan kebutuhan Anda" />

        <div className="mt-14 grid gap-6 lg:grid-cols-2 lg:max-w-4xl lg:mx-auto">
          {pricingCards.map((card) => (
            <div key={card.title} className={`landing-price-card relative overflow-hidden rounded-3xl ${card.popular ? 'landing-price-primary ring-1 ring-primary/20' : 'landing-price-secondary'}`}>
              {card.popular && (
                <div className="absolute right-4 top-4 z-10 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-primary/20">
                  <div className="inline-flex items-center gap-1">
                    <Crown className="h-3.5 w-3.5" />
                    Paling Populer
                  </div>
                </div>
              )}
              <div className={`h-full rounded-3xl p-6 sm:p-8 ${card.popular ? 'landing-pricing-surface-primary' : 'landing-pricing-surface-secondary'}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.popular ? 'bg-primary/10 text-primary' : 'bg-chart-2/10 text-chart-2'}`}>
                    <card.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">{card.title}</h3>
                    <p className="text-sm text-mutedForeground">{card.description}</p>
                  </div>
                </div>

                <div className="mt-6 text-4xl font-black tracking-tight text-foreground">
                  {formatMiniRupiah(card.price)}
                  <span className="text-base font-semibold text-mutedForeground">/gambar</span>
                </div>

                <ul className="mt-6 space-y-3">
                  {card.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-foreground">
                      <BadgeCheck className={`h-4 w-4 ${card.popular ? 'text-primary' : 'text-chart-2'}`} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-20 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            <h3 className="text-2xl font-bold text-foreground sm:text-3xl">Beli Credit</h3>
          </div>
          <p className="text-mutedForeground">Beli credit untuk mulai memproses logo Anda</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3 lg:max-w-5xl lg:mx-auto">
          {creditPackages.map((pkg) => (
            <div key={pkg.name} className={`landing-mini-card landing-credit-card rounded-2xl p-5 ${pkg.highlight ? 'landing-credit-card-highlight ring-1 ring-primary/20' : ''}`}>
              {pkg.highlight && <div className="mb-3 inline-flex rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">Rekomendasi</div>}
              <h4 className="text-lg font-bold text-foreground">{pkg.name}</h4>
              <p className="mt-1 text-sm text-mutedForeground">{pkg.credits} credit untuk proses gambar</p>
              <div className="mt-4 text-2xl font-black text-foreground">{formatMiniRupiah(pkg.price)}</div>
              <div className="mt-1 text-sm text-mutedForeground">{formatMiniRupiah(pkg.pricePerCredit)}/credit</div>
              <div className="mt-4 space-y-2 text-sm text-mutedForeground">
                <p>{pkg.aiRedesign}x AI Redesign</p>
                <p>{pkg.readyToTrace}x Vector Siap Proses</p>
              </div>
              {pkg.callout && <p className="mt-3 text-xs text-mutedForeground">{pkg.callout}</p>}
              <button
                type="button"
                onClick={() => scrollToId('auth')}
                className={`mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
                  pkg.highlight ? 'gradient-bg text-white shadow-lg shadow-primary/20' : 'border border-border bg-white text-foreground hover:border-primary/30 hover:bg-white/5'
                }`}
              >
                Mulai Paket Ini
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StarRow({ rating }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} className={`h-4 w-4 ${index < rating ? 'fill-chart-3 text-chart-3' : 'text-border'}`} />
      ))}
    </div>
  );
}

function TestimonialsSection() {
  return (
    <section id="testimonials" className="relative overflow-hidden py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-1/3 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-20 bottom-1/3 h-64 w-64 rounded-full bg-chart-3/5 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="Testimoni Nyata" title="Apa Kata Mereka" subtitle="Ribuan pengguna telah merasakan kemudahan redesign logo dengan AI" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <div key={testimonial.name} className={`rounded-3xl p-6 ${index === 1 ? 'landing-testimonial-featured md:mt-8' : 'glass-card'}`}>
              <div className="mb-4 flex items-start justify-between">
                <div className="relative">
                  <Quote className="h-10 w-10 text-primary/10" />
                  <Quote className="absolute left-1 top-1 h-7 w-7 text-primary/20" />
                </div>
                <div className="flex items-center gap-1 rounded-full bg-chart-3/10 px-2.5 py-1 text-xs font-bold text-chart-3">
                  <Star className="h-3 w-3 fill-chart-3 text-chart-3" />
                  {testimonial.rating}.0
                </div>
              </div>
              <StarRow rating={testimonial.rating} />
              <p className="mt-4 mb-6 text-sm leading-relaxed text-mutedForeground sm:text-[15px]">
                {testimonial.quote}
              </p>
              <div className="flex items-center gap-3 border-t border-border pt-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-2 text-sm font-bold text-white">
                  {testimonial.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-xs text-mutedForeground">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 flex justify-center">
          <div className="landing-trust-pill inline-flex items-center gap-3 rounded-full px-4 py-3 text-sm text-mutedForeground">
            <div className="flex -space-x-2">
              {['S', 'R', 'A', 'B'].map((initial) => (
                <span key={initial} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-bold text-foreground">
                  {initial}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1 text-chart-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-3.5 w-3.5 fill-chart-3 text-chart-3" />
              ))}
            </div>
            <span>Dipercaya 500+ pengguna</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="relative overflow-hidden py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 top-1/4 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -left-20 bottom-1/4 h-40 w-40 rounded-full bg-chart-2/5 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <SectionHeader title="Pertanyaan Umum" subtitle="Temukan jawaban untuk pertanyaan yang sering diajukan" />
        <div className="mt-12 overflow-hidden rounded-3xl border border-border/70 glass-card">
          {faqItems.map((item, index) => (
            <details key={item.question} className="landing-faq-item group overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-left text-sm font-semibold text-foreground sm:text-base">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/20 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="flex-1">{item.question}</span>
                <ChevronDown className="h-4 w-4 text-mutedForeground transition group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5 pl-14 text-sm leading-relaxed text-mutedForeground sm:text-base">
                {item.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection({ onStart }) {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute inset-0">
        <div className="absolute inset-0 gradient-bg" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(2,6,23,0.35)_100%)]" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <div className="mb-8 flex h-18 w-18 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-xl backdrop-blur-sm">
            <Sparkles className="h-9 w-9 text-white" />
          </div>
          <h2 className="max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Siap Transformasi <span className="relative inline-block">Logo Anda?
              <span className="absolute -bottom-1 left-0 right-0 h-1 rounded-full bg-chart-3/60" />
            </span>
          </h2>
          <p className="mt-5 max-w-xl text-lg text-white/80 sm:text-xl">
            Daftar sekarang dan dapatkan 5 credit gratis untuk mencoba layanan kami.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-8 text-base font-semibold text-primary shadow-lg transition hover:bg-white/95"
            >
              Mulai Gratis Sekarang
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollToId('how-it-works')}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
            >
              <Eye className="h-4 w-4" />
              Lihat Demo
            </button>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
            {trustBadges.map((badge) => (
              <div key={badge.text} className="landing-cta-badge rounded-2xl px-4 py-3">
                <badge.icon className="mx-auto h-5 w-5 text-white/80" />
                <div className="mt-2 text-sm font-semibold text-white/90">{badge.text}</div>
                <div className="mt-1 text-[10px] text-white/60">{badge.subtext}</div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-white/55">Tanpa risiko - Tanpa komitmen - Bisa berhenti kapan saja</p>
        </div>
      </div>
    </section>
  );
}

function AuthSection({ authPanel, onStart }) {
  if (!authPanel) return null;
  return (
    <section id="auth" className="relative overflow-hidden py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-10 top-10 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute right-10 bottom-10 h-40 w-40 rounded-full bg-chart-2/5 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Akses akun
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              <span className="gradient-text">Masuk untuk melanjutkan</span>
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-mutedForeground">
              Gunakan akun Anda untuk mengakses dashboard, billing, riwayat job, dan admin. System kerja tetap memakai backend current project.
            </p>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-white px-6 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary/5"
            >
              Scroll ke form login
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="landing-auth-shell">{authPanel}</div>
        </div>
      </div>
    </section>
  );
}

function PublicLanding({ onStart, authPanel, onNavigate }) {
  return (
    <div className="landing-shell min-h-screen bg-background text-foreground">
      <PublicNav onStart={onStart} onNavigate={onNavigate} />
      <HeroSection onStart={onStart} />
      <HowItWorksSection />
      <PricingSection />
      <TestimonialsSection />
      <FaqSection />
      <CtaSection onStart={onStart} />
      <AuthSection authPanel={authPanel} onStart={onStart} />
      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
}

function LegalShell({ title, subtitle, icon: Icon, onNavigate, children }) {
  return (
    <article className="min-h-screen gradient-bg-subtle">
      <div className="gradient-bg py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigatePath('/', onNavigate)}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            Kembali
          </button>
          <div className="flex items-start gap-4 text-white">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm">
              <Icon className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold sm:text-4xl lg:text-5xl">{title}</h1>
              <p className="mt-3 text-lg text-white/80">{subtitle}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">{children}</div>
    </article>
  );
}

function LegalSectionList({ sections }) {
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-3xl p-6">
        <h2 className="text-lg font-semibold text-foreground">Daftar Isi</h2>
        <ol className="mt-4 space-y-2">
          {sections.map((section) => (
            <li key={section.title}>
              <a href={`#${slugify(section.title)}`} className="inline-flex items-center gap-2 text-sm text-mutedForeground transition hover:text-primary">
                <section.icon className="h-4 w-4 shrink-0" />
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title} id={slugify(section.title)} className="glass-card rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-2">
              <section.icon className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-bold text-foreground">{section.title}</h3>
            </div>

            {section.content?.map((paragraph) => (
              <p key={paragraph} className="mb-4 text-sm leading-relaxed text-mutedForeground sm:text-base">
                {paragraph}
              </p>
            ))}

            {section.subsections?.map((subsection) => (
              <div key={subsection.subtitle} className="mb-4">
                <h4 className="mb-2 text-sm font-semibold text-foreground sm:text-base">{subsection.subtitle}</h4>
                <ul className="ml-4 space-y-1.5">
                  {subsection.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-mutedForeground sm:text-base">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {section.list && (
              <ul className="ml-4 space-y-2">
                {section.list.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-mutedForeground sm:text-base">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    {item}
                  </li>
                ))}
              </ul>
            )}

            {section.afterList?.map((paragraph) => (
              <p key={paragraph} className="mt-4 text-sm leading-relaxed text-mutedForeground sm:text-base">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrivacyPage({ onNavigate }) {
  return (
    <LegalShell title="Kebijakan Privasi" subtitle="Bagaimana kami mengumpulkan, menggunakan, dan melindungi informasi pribadi Anda" icon={ShieldCheck} onNavigate={onNavigate}>
      <LegalSectionList sections={privacySections} />
      <div className="mt-12 text-center text-sm text-mutedForeground">
        Pertanyaan tentang kebijakan privasi kami?{' '}
        <button type="button" onClick={() => navigatePath('/contact', onNavigate)} className="text-primary underline underline-offset-4">
          Hubungi kami
        </button>
      </div>
    </LegalShell>
  );
}

function TermsPage({ onNavigate }) {
  return (
    <LegalShell title="Syarat dan Ketentuan" subtitle="Aturan penggunaan layanan AI Logo Redesign" icon={FileText} onNavigate={onNavigate}>
      <LegalSectionList sections={termsSections} />
      <div className="mt-12 text-center text-sm text-mutedForeground">
        Pertanyaan tentang syarat dan ketentuan?{' '}
        <button type="button" onClick={() => navigatePath('/contact', onNavigate)} className="text-primary underline underline-offset-4">
          Hubungi kami
        </button>
      </div>
    </LegalShell>
  );
}

function ContactFaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      className="glass-card rounded-2xl p-4 text-left transition hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-3">
        <HelpCircle className="h-5 w-5 shrink-0 text-primary" />
        <span className="flex-1 text-sm font-semibold text-foreground">{question}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-mutedForeground transition ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && <p className="mt-3 text-sm leading-relaxed text-mutedForeground">{answer}</p>}
    </button>
  );
}

function ContactPage({ onNavigate }) {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const maxMessageLength = 5000;

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    if (errors[name]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[name];
        return next;
      });
    }
  }

  function handleSubjectChange(value) {
    setFormData((current) => ({ ...current, subject: value }));
    if (errors.subject) {
      setErrors((current) => {
        const next = { ...current };
        delete next.subject;
        return next;
      });
    }
  }

  function validate() {
    const nextErrors = {};
    if (!formData.name.trim()) nextErrors.name = 'Nama wajib diisi';
    if (!formData.email.trim()) nextErrors.email = 'Email wajib diisi';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) nextErrors.email = 'Format email tidak valid';
    if (!formData.subject) nextErrors.subject = 'Subjek wajib dipilih';
    if (!formData.message.trim()) nextErrors.message = 'Pesan wajib diisi';
    else if (formData.message.length < 10) nextErrors.message = 'Pesan minimal 10 karakter';
    else if (formData.message.length > maxMessageLength) nextErrors.message = `Pesan maksimal ${maxMessageLength.toLocaleString()} karakter`;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await submitContactMessage(formData);
      setSuccess(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
      window.setTimeout(() => setSuccess(false), 3500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal mengirim pesan. Silakan coba lagi nanti.';
      setErrors((current) => ({ ...current, submit: message }));
    } finally {
      setIsSubmitting(false);
    }
  }

  function goToLandingSection(id) {
    navigatePath('/', onNavigate);
    window.setTimeout(() => scrollToId(id), 50);
  }

  return (
    <LegalShell title="Hubungi Kami" subtitle="Punya pertanyaan atau butuh bantuan? Tim kami siap membantu Anda" icon={Mail} onNavigate={onNavigate}>
      <div className="mb-10 grid gap-3 sm:grid-cols-2">
        {contactFaq.map((item) => (
          <ContactFaqItem key={item.question} {...item} />
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="glass-card rounded-3xl p-6">
          <div className="mb-6 flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Kirim Pesan</h2>
          </div>

          {success ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <h3 className="mt-4 text-xl font-semibold text-foreground">Pesan Terkirim</h3>
              <p className="mt-2 text-sm text-mutedForeground">Terima kasih telah menghubungi kami. Kami akan merespons pesan Anda dalam 1x24 jam.</p>
              <button type="button" onClick={() => setSuccess(false)} className="mt-6 rounded-xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700">
                Kirim Pesan Lain
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <User className="h-4 w-4" />
                    Nama Lengkap
                  </span>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Masukkan nama Anda"
                    className={`w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none focus:border-primary ${errors.name ? 'border-red-400' : 'border-border'}`}
                  />
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </label>

                <label className="space-y-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <AtSign className="h-4 w-4" />
                    Email
                  </span>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="nama@email.com"
                    className={`w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none focus:border-primary ${errors.email ? 'border-red-400' : 'border-border'}`}
                  />
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </label>
              </div>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileText className="h-4 w-4" />
                  Subjek
                </span>
                <div className="grid gap-2 sm:grid-cols-4">
                  {contactSubjects.map((subject) => (
                    <button
                      key={subject.value}
                      type="button"
                      onClick={() => handleSubjectChange(subject.value)}
                      className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                        formData.subject === subject.value ? 'border-primary bg-primary text-white' : 'border-border bg-white text-foreground hover:border-primary/40 hover:bg-primary/5'
                      }`}
                    >
                      {subject.label}
                    </button>
                  ))}
                </div>
                {errors.subject && <p className="text-xs text-red-500">{errors.subject}</p>}
              </label>

              <label className="space-y-2">
                <span className="flex items-center justify-between text-sm font-medium text-foreground">
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Pesan
                  </span>
                  <span className={`text-xs tabular-nums ${formData.message.length > maxMessageLength * 0.9 ? 'text-amber-600' : 'text-mutedForeground'}`}>
                    {formData.message.length.toLocaleString()} / {maxMessageLength.toLocaleString()}
                  </span>
                </span>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={8}
                  placeholder="Tuliskan pertanyaan atau kebutuhan Anda di sini"
                  className={`w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:border-primary ${errors.message ? 'border-red-400' : 'border-border'}`}
                />
                {errors.message && <p className="text-xs text-red-500">{errors.message}</p>}
              </label>

              {errors.submit && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errors.submit}</p>}

              <button type="submit" disabled={isSubmitting} className="gradient-bg inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSubmitting ? 'Mengirim...' : 'Kirim Pesan'}
              </button>
            </form>
          )}
        </div>

        <aside className="space-y-6">
          <div className="glass-card rounded-3xl p-6">
            <h3 className="text-lg font-semibold text-foreground">Info Kontak</h3>
            <div className="mt-4 space-y-3 text-sm text-mutedForeground">
              <p>Telepon: {SUPPORT_PHONE}</p>
              <p>WhatsApp: {SUPPORT_WHATSAPP}</p>
              <p>Email: {SUPPORT_EMAIL_LABEL}</p>
              <p>Jam kerja: Senin - Jumat, 09.00 - 17.00 WIB</p>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-6">
            <h3 className="text-lg font-semibold text-foreground">Arah Cepat</h3>
            <div className="mt-4 space-y-2 text-sm">
              <button type="button" onClick={() => goToLandingSection('faq')} className="flex w-full items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-left text-foreground transition hover:border-primary/40 hover:bg-primary/5">
                Lihat FAQ
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </button>
              <button type="button" onClick={() => goToLandingSection('pricing')} className="flex w-full items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-left text-foreground transition hover:border-primary/40 hover:bg-primary/5">
                Lihat Harga
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </button>
              <button type="button" onClick={() => goToLandingSection('beranda')} className="flex w-full items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-left text-foreground transition hover:border-primary/40 hover:bg-primary/5">
                Kembali ke Landing
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </LegalShell>
  );
}

function AboutPage({ onNavigate }) {
  const stats = aboutStats.map((stat) => ({ ...stat }));

  return (
    <LegalShell title="Tentang Kami" subtitle="Mengenal lebih dekat AI Logo Redesign, platform redesign logo berbasis AI" icon={Sparkles} onNavigate={onNavigate}>
      <div className="space-y-6">
        <div className="glass-card rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-foreground">Tentang Kami</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-mutedForeground sm:text-base">
            <p>
              AI Logo Redesign adalah platform inovatif yang menggunakan kecerdasan buatan untuk mentransformasi logo kaos menjadi desain profesional yang siap untuk disablon atau dijadikan sticker.
            </p>
            <p>
              Kami memahami tantangan yang dihadapi oleh konveksi, seller kaos online, dan desainer freelance dalam mengubah logo berkualitas rendah menjadi desain yang tajam dan siap cetak.
            </p>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {aboutMissionVision.map((card) => (
            <div key={card.title} className="glass-card rounded-3xl p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <card.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mutedForeground">{card.description}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => {
            const { count, ref } = useCounter(stat.value, true, 1400);
            const displayValue = Number.isInteger(stat.value) ? count.toLocaleString('id-ID') : String(stat.value);
            return (
              <div key={stat.label} ref={ref} className="glass-card rounded-3xl p-6 text-center">
                <stat.icon className="mx-auto h-6 w-6 text-primary" />
                <div className="mt-3 text-3xl font-black text-foreground">
                  {displayValue}
                  {stat.suffix}
                </div>
                <div className="mt-1 text-sm text-mutedForeground">{stat.label}</div>
              </div>
            );
          })}
        </div>

        <div className="glass-card rounded-3xl p-6">
          <h3 className="text-xl font-semibold text-foreground">Perjalanan Kami</h3>
          <div className="relative mt-6 space-y-4">
            <div className="absolute left-5 top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-chart-2/40 to-chart-3/40" />
            {aboutTimeline.map((milestone) => (
              <div key={milestone.date} className="relative flex items-start gap-4 pl-0">
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-2 text-white">
                  <milestone.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 rounded-2xl border border-border bg-white p-4">
                  <div className="text-xs font-mono text-primary">{milestone.date}</div>
                  <h4 className="mt-1 text-sm font-semibold text-foreground">{milestone.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-mutedForeground">{milestone.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6">
          <h3 className="text-xl font-semibold text-foreground">Teknologi yang Digunakan</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aboutTechStack.map((tech) => (
              <div key={tech.name} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <tech.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{tech.name}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-mutedForeground">{tech.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6">
          <h3 className="text-xl font-semibold text-foreground">Tim Kami</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {aboutTeam.map((member) => (
              <div key={member.name} className="rounded-2xl border border-border bg-white p-4 text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-chart-2/20 text-lg font-bold text-primary">
                  {member.initials}
                </div>
                <p className="text-sm font-semibold text-foreground">{member.name}</p>
                <p className="text-xs text-mutedForeground">{member.role}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-6">
          <h3 className="text-xl font-semibold text-foreground">Mengapa Memilih Kami?</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white p-4">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-chart-2/10 text-chart-2">
                <Zap className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-semibold text-foreground">Proses Cepat</h4>
              <p className="mt-1 text-xs leading-relaxed text-mutedForeground">Hasil redesign logo hanya dalam hitungan detik hingga menit.</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-semibold text-foreground">Keamanan Terjamin</h4>
              <p className="mt-1 text-xs leading-relaxed text-mutedForeground">Gambar Anda diproses secara aman dan dihapus dari server setelah selesai.</p>
            </div>
          </div>
        </div>
      </div>
    </LegalShell>
  );
}

export default function LandingPage({ onStart, authPanel, onNavigate }) {
  return <PublicLanding onStart={onStart} authPanel={authPanel} onNavigate={onNavigate} />;
}

export { AboutPage, ContactPage, PrivacyPage, TermsPage };
