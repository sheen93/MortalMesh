import type { MetadataRoute } from 'next';
import { HAND_GESTURES } from '@/data/handGestures';
import { POSE_PRESETS } from '@/data/poses';
import { SITE_URL } from '@/data/seoContent';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/poses`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/hands`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/gesture-timer`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
  ];

  const poseRoutes: MetadataRoute.Sitemap = POSE_PRESETS.map((pose) => ({
    url: `${SITE_URL}/poses/${pose.id}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const handRoutes: MetadataRoute.Sitemap = HAND_GESTURES.map((gesture) => ({
    url: `${SITE_URL}/hands/${gesture.id}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.75,
  }));

  return [...staticRoutes, ...poseRoutes, ...handRoutes];
}
