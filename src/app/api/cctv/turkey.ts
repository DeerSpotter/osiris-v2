import type { CctvCamera } from './types';

/**
 * Turkey CCTV Cameras — Istanbul IBB Traffic Cameras
 * Source: Istanbul Metropolitan Municipality (IBB)
 * These are live webcam streams embedded via Windy.com or direct feeds
 * covering key Istanbul infrastructure points.
 */

const TURKEY_CAMERAS: CctvCamera[] = [
  // ── Istanbul Bosphorus Bridge (15 Temmuz) ──
  {
    id: 'tr-ist-bosphorus',
    lat: 41.0451,
    lng: 29.0345,
    name: 'Bosphorus Bridge',
    city: 'Istanbul',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1592223203/embed',
    stream_type: 'iframe',
    source: 'IBB Istanbul',
  },
  // ── Fatih Sultan Mehmet Bridge ──
  {
    id: 'tr-ist-fsm',
    lat: 41.0901,
    lng: 29.0669,
    name: 'FSM Bridge',
    city: 'Istanbul',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1592223267/embed',
    stream_type: 'iframe',
    source: 'IBB Istanbul',
  },
  // ── Galata Bridge ──
  {
    id: 'tr-ist-galata',
    lat: 41.0195,
    lng: 28.9737,
    name: 'Galata Bridge',
    city: 'Istanbul',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1592223198/embed',
    stream_type: 'iframe',
    source: 'IBB Istanbul',
  },
  // ── Taksim Square ──
  {
    id: 'tr-ist-taksim',
    lat: 41.0370,
    lng: 28.9850,
    name: 'Taksim Square',
    city: 'Istanbul',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1592308483/embed',
    stream_type: 'iframe',
    source: 'IBB Istanbul',
  },
  // ── Sultanahmet (Blue Mosque area) ──
  {
    id: 'tr-ist-sultanahmet',
    lat: 41.0054,
    lng: 28.9768,
    name: 'Sultanahmet',
    city: 'Istanbul',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1592308408/embed',
    stream_type: 'iframe',
    source: 'IBB Istanbul',
  },
  // ── Kadıköy Ferry Port ──
  {
    id: 'tr-ist-kadikoy',
    lat: 40.9910,
    lng: 29.0237,
    name: 'Kadıköy Ferry Port',
    city: 'Istanbul',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1592308355/embed',
    stream_type: 'iframe',
    source: 'IBB Istanbul',
  },
  // ── Üsküdar ──
  {
    id: 'tr-ist-uskudar',
    lat: 41.0229,
    lng: 29.0152,
    name: 'Üsküdar Waterfront',
    city: 'Istanbul',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1592308426/embed',
    stream_type: 'iframe',
    source: 'IBB Istanbul',
  },
  // ── Ankara – Kızılay ──
  {
    id: 'tr-ankara-kizilay',
    lat: 39.9208,
    lng: 32.8541,
    name: 'Kızılay Square',
    city: 'Ankara',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1460467183/embed',
    stream_type: 'iframe',
    source: 'Windy.com',
  },
  // ── Antalya – Old Town ──
  {
    id: 'tr-antalya-oldtown',
    lat: 36.8841,
    lng: 30.7056,
    name: 'Antalya Old Town',
    city: 'Antalya',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1460508553/embed',
    stream_type: 'iframe',
    source: 'Windy.com',
  },
  // ── Izmir – Kordon ──
  {
    id: 'tr-izmir-kordon',
    lat: 38.4237,
    lng: 27.1428,
    name: 'Izmir Kordon',
    city: 'Izmir',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1460507837/embed',
    stream_type: 'iframe',
    source: 'Windy.com',
  },
  // ── Cappadocia – Balloon View ──
  {
    id: 'tr-cappadocia',
    lat: 38.6431,
    lng: 34.8287,
    name: 'Cappadocia Balloon View',
    city: 'Nevşehir',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1604505738/embed',
    stream_type: 'iframe',
    source: 'Windy.com',
  },
  // ── Bodrum Marina ──
  {
    id: 'tr-bodrum-marina',
    lat: 37.0344,
    lng: 27.4305,
    name: 'Bodrum Marina',
    city: 'Bodrum',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1460508249/embed',
    stream_type: 'iframe',
    source: 'Windy.com',
  },
  // ── Trabzon Coast ──
  {
    id: 'tr-trabzon',
    lat: 41.0015,
    lng: 39.7178,
    name: 'Trabzon Coast',
    city: 'Trabzon',
    country: 'Turkey',
    stream_url: 'https://www.windy.com/webcams/1460508581/embed',
    stream_type: 'iframe',
    source: 'Windy.com',
  },
];

export async function fetchTurkeyCameras(): Promise<CctvCamera[]> {
  return TURKEY_CAMERAS;
}

export default TURKEY_CAMERAS;
