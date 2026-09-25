import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  return rss({
    title: 'Saram Hai',
    description: 'Agent architecture, orchestration and production LLM systems.',
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.title, description: p.data.description,
      pubDate: p.data.pubDate, link: `/${p.id}/`,
    })),
  });
}
