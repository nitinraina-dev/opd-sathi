// Inline SVG icons (24 x 24, drawn with lines). Decorative unless `label` is
// given: every button also shows a word, so screen readers read the word.

const I = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  register: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
  slip: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />
      <path d="M14.5 5.5v13" strokeDasharray="2 2.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  map: (
    <>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  emergency: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 7.5v9M7.5 12h9" strokeWidth="2.6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 22 20.5H2z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.6v.1" strokeWidth="2.6" />
    </>
  ),
  hand: (
    <>
      <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 11V6a1.5 1.5 0 0 1 3 0v7.5a7 7 0 0 1-7 7c-3 0-4.5-2-6-4.5l-1.2-2a1.5 1.5 0 0 1 2.6-1.5L8 13" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16.5 9a4 4 0 0 1 0 6" />
      <path d="M19 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  settings: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  print: (
    <>
      <path d="M7 8V3h10v5" />
      <rect x="3" y="8" width="18" height="9" rx="2" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  phone: (
    <path d="M5 3.5h3.5l1.8 4.8-2.3 1.4a11 11 0 0 0 6.3 6.3l1.4-2.3 4.8 1.8V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5.5a2 2 0 0 1 2-2z" />
  ),
  ambulance: (
    <>
      <path d="M2 16V7h11v9" />
      <path d="M13 10h4l4 4v2h-2" />
      <path d="M7 9.5v4M5 11.5h4" />
      <circle cx="6.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
      <path d="M8.5 17h6" />
    </>
  ),
  lift: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 9.5l3-3 3 3M9 14.5l3 3 3-3" />
    </>
  ),
  stairs: <path d="M3 20h5v-5h5v-5h5V5h3" />,
  ramp: (
    <>
      <path d="M3 19h18L3 9z" />
    </>
  ),
  wheelchair: (
    <>
      <circle cx="11" cy="4" r="1.6" />
      <path d="M11 7.5V13h5.5l2.5 5.5" />
      <path d="M11 10h4.5" />
      <path d="M8 10.5a5.5 5.5 0 1 0 7.5 7" />
    </>
  ),
  toilet: (
    <>
      <circle cx="7" cy="4.5" r="1.7" />
      <path d="M5 8h4v6.5H8V21H6v-6.5H5z" />
      <circle cx="17" cy="4.5" r="1.7" />
      <path d="M15.5 8h3l2 7h-2.2V21h-2.6v-6H13.5z" />
      <path d="M12 3v18" />
    </>
  ),
  water: (
    <>
      <path d="M12 3s6 6.8 6 11a6 6 0 0 1-12 0c0-4.2 6-11 6-11z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  pill: (
    <>
      <path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z" />
      <path d="M7 7l7 7" />
    </>
  ),
  lab: (
    <>
      <path d="M9 3h6M10 3v13.5a2 2 0 0 0 4 0V3" />
      <path d="M10 10h4" />
    </>
  ),
  xray: (
    <>
      <rect x="3.5" y="3" width="17" height="18" rx="2" />
      <path d="M12 6.5v11M8.5 9h7M8.5 12h7M8.5 15h7" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18V7" />
      <path d="M3 14h18v4" />
      <path d="M21 14v-3a3 3 0 0 0-3-3h-7v6" />
      <circle cx="7" cy="10.5" r="2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.6v.1" strokeWidth="2.6" />
    </>
  ),
  door: (
    <>
      <path d="M4 21h16" />
      <path d="M6 21V3.5h12V21" />
      <path d="M14.5 12v.1" strokeWidth="2.6" />
    </>
  ),
  chair: (
    <>
      <path d="M7 3v10h10v8" />
      <path d="M7 13v8" />
      <path d="M7 9h9" />
    </>
  ),
  doctor: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M5.5 21v-3a6.5 6.5 0 0 1 13 0v3" />
      <path d="M9 13.5v3a2 2 0 0 0 4 0" />
      <circle cx="15.5" cy="17" r="1.2" />
    </>
  ),
  nurses: (
    <>
      <path d="M3 13h18v7H3z" />
      <path d="M8 13V9a4 4 0 0 1 8 0v4" />
      <path d="M12 8v3M10.5 9.5h3" />
    </>
  ),
  registration: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.6v.1" strokeWidth="2.6" />
    </>
  ),
  waiting: (
    <>
      <path d="M7 3v10h10v8" />
      <path d="M7 13v8" />
      <path d="M7 9h9" />
    </>
  ),
  ward: (
    <>
      <path d="M3 18V7" />
      <path d="M3 14h18v4" />
      <path d="M21 14v-3a3 3 0 0 0-3-3h-7v6" />
      <circle cx="7" cy="10.5" r="2" />
    </>
  ),
  opd: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M5.5 21v-3a6.5 6.5 0 0 1 13 0v3" />
      <path d="M9 13.5v3a2 2 0 0 0 4 0" />
    </>
  ),
  entrance: (
    <>
      <path d="M4 21h16" />
      <path d="M6 21V3.5h12V21" />
      <path d="M14.5 12v.1" strokeWidth="2.6" />
    </>
  ),
  pharmacy: (
    <>
      <path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z" />
      <path d="M7 7l7 7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.2a5 5 0 0 1 5.5 5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  sms: (
    <>
      <path d="M4 5h16v11H9.5L4 20z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  qr: (
    <>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
      <path d="M14 14h2.5v2.5H14zM18 18h2v2h-2zM14 19.5h2M19.5 14v2" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  chart: <path d="M4 20h16M7 16.5v-5M12 16.5V7M17 16.5v-8" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  cloud: <path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1A4.5 4.5 0 0 0 7 18.5z" />,
  cloudSun: (
    <>
      <path d="M8 4.5v1M3.5 9h1M4.8 5.8l.8.8M11.2 5.8l-.8.8" />
      <path d="M5.6 11.5a3.2 3.2 0 0 1 5.6-2.8" />
      <path d="M9 19.5h8.5a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.2-.8A3.9 3.9 0 0 0 9 19.5z" />
    </>
  ),
  rain: (
    <>
      <path d="M7 15h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 6 4.5 4.5 0 0 0 7 15z" />
      <path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5" />
    </>
  ),
  storm: (
    <>
      <path d="M7 15h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 6 4.5 4.5 0 0 0 7 15z" />
      <path d="M12.5 13l-2 4h3l-2 4" />
    </>
  ),
  fog: <path d="M4 9h16M3 13h18M5 17h14" />,
  wind: (
    <>
      <path d="M3 8.5h10.5a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12.5h15a3 3 0 1 1-3 3" />
      <path d="M3 16.5h7" />
    </>
  ),
  car: (
    <>
      <path d="M3 16.5v-3.5l2-5.5h14l2 5.5v3.5" />
      <path d="M3 13h18" />
      <path d="M3 16.5h18" />
      <path d="M5 16.5V19M19 16.5V19" />
      <circle cx="7.5" cy="14.8" r=".6" />
      <circle cx="16.5" cy="14.8" r=".6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  textsize: <path d="M3 18 8 6l5 12M5 14h6M14.5 18l3-7 3 7M15.5 16h4" />,
  contrast: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 19 6v5.5c0 4.4-3 8.1-7 9.5-4-1.4-7-5.1-7-9.5V6z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.6" />
    </>
  ),
  badge: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8 17a4 4 0 0 1 8 0" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />,
  lungs: (
    <>
      <path d="M12 3.5v8" />
      <path d="M12 11.5c-1.5 0-2.5-1-3.3-2.6C6.5 9.6 4 13.5 4 17.5c0 1.8 1.6 2.3 3.5 1.4 2.5-1.2 3.5-3.6 4.5-7.4" />
      <path d="M12 11.5c1.5 0 2.5-1 3.3-2.6 2.2.7 4.7 4.6 4.7 8.6 0 1.8-1.6 2.3-3.5 1.4-2.5-1.2-3.5-3.6-4.5-7.4" />
    </>
  ),
  blood: (
    <>
      <path d="M12 3s6 6.8 6 11a6 6 0 0 1-12 0c0-4.2 6-11 6-11z" />
      <path d="M12 11v6M9 14h6" />
    </>
  ),
  faint: (
    <>
      <circle cx="4.5" cy="14" r="2" />
      <path d="M7.5 14.5h9l3 3" />
      <path d="M8 17.5h7" />
      <path d="M14 8.5l1.2 1.2M17.5 7v1.6M20.5 8.5l-1.2 1.2" />
    </>
  ),
  face: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9.5v.1M15 10.5v.1" strokeWidth="2.6" />
      <path d="M8.5 16.5 16 14.5" />
    </>
  ),
  injury: (
    <>
      <path d="M4.6 14.6l10-10a2.9 2.9 0 0 1 4.1 4.1l-10 10a2.9 2.9 0 0 1-4.1-4.1z" />
      <path d="M10 10.2v.1M12 12.2v.1M10 12.4v.1M12.2 10v.1" strokeWidth="2.2" />
    </>
  ),
  pregnant: (
    <>
      <circle cx="11" cy="4" r="2" />
      <path d="M9.5 8h3c3.5 0 5 3.2 3.4 6.4L13 15.5V21" />
      <path d="M9.5 8v13" />
    </>
  ),
  child: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M7.5 20.5v-4a4.5 4.5 0 0 1 9 0v4" />
      <path d="M10 4.4c.6-.9 1.4-1.4 2-1.4" />
    </>
  ),
  fever: (
    <>
      <path d="M10 4.5a2 2 0 0 1 4 0V14a4 4 0 1 1-4 0z" />
      <path d="M12 9.5v6.5" />
    </>
  ),
  bone: (
    <path d="M7.5 9.5a2.2 2.2 0 1 1 2-2l6.5 6.5a2.2 2.2 0 1 1 2 2 2.2 2.2 0 1 1-2 2l-6.5-6.5a2.2 2.2 0 1 1-2-2z" />
  ),
  ear: (
    <>
      <path d="M7 9.5a5.5 5.5 0 0 1 11 0c0 3.5-3.5 4.5-3.5 7.5a3.2 3.2 0 0 1-6.4.3" />
      <path d="M10.5 10a2 2 0 0 1 3.6 1.2c0 1-.9 1.5-1.6 2" />
    </>
  ),
  woman: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 8.5 7.5 17h9z" />
      <path d="M10.3 17v4M13.7 17v4" />
    </>
  ),
  man: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <path d="M8.5 9h7v6.5h-1.7V21h-3.6v-5.5H8.5z" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M6 21v-3.5a6 6 0 0 1 12 0V21" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.4 9.8l6-.7z" />,
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.9" />
      <path d="M12 17.4v.1" strokeWidth="2.6" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4.5h12l-2.5 4 2.5 4H5" />
    </>
  ),
  bolt: <path d="M13 2.5 4.5 13.5H11L10 21.5l9-11.5h-6.5z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4" r="1.8" />
      <path d="M10 21l2.2-6.5L15 17v4" />
      <path d="M9 11.5l2-4.2h3l2 4 2.5 1" />
      <path d="M12.2 14.5l-.2-7" />
    </>
  ),
  you: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </>
  ),
  'turn-left': (
    <>
      <path d="M15 20v-7a4 4 0 0 0-4-4H5" />
      <path d="M8.5 5.5 5 9l3.5 3.5" />
    </>
  ),
  'turn-right': (
    <>
      <path d="M9 20v-7a4 4 0 0 1 4-4h6" />
      <path d="M15.5 5.5 19 9l-3.5 3.5" />
    </>
  ),
  'turn-straight': (
    <>
      <path d="M12 20V4.5" />
      <path d="M7 9.5l5-5 5 5" />
    </>
  ),
  'turn-back': (
    <>
      <path d="M9 20V9a4 4 0 0 1 8 0v4" />
      <path d="M13.5 9.5 17 13l3.5-3.5" />
    </>
  ),
  steps: <path d="M3 20h5v-5h5v-5h5V5h3" />,
  rupee: <path d="M6.5 4h11M6.5 8.5h11M8 4c4.5 0 7 1.4 7 4.5S12.5 13 8 13h-1.5l8 7" />,
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  faceGood: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10v.1M15 10v.1" strokeWidth="2.6" />
      <path d="M8 14.5a4.5 4.5 0 0 0 8 0" />
    </>
  ),
  faceOkay: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10v.1M15 10v.1" strokeWidth="2.6" />
      <path d="M8.5 15.5h7" />
    </>
  ),
  faceBad: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10v.1M15 10v.1" strokeWidth="2.6" />
      <path d="M8 17a4.5 4.5 0 0 1 8 0" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" />
    </>
  ),
  external: <path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v5.5H4.5V6H10" />,
  dot: <circle cx="12" cy="12" r="3" />,
}

export default function Icon({ name, size = 28, className = '', label, style }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {I[name] || I.dot}
    </svg>
  )
}

export const iconNames = Object.keys(I)
