const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

async function giphyFetch(endpoint, params) {
  if (!GIPHY_API_KEY) {
    return { data: [] };
  }

  const url = new URL(`${GIPHY_BASE}/${endpoint}`);
  url.searchParams.set('api_key', GIPHY_API_KEY);
  url.searchParams.set('limit', '20');
  url.searchParams.set('rating', 'pg-13');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Giphy API error');
  return res.json();
}

function formatResults(data) {
  return (data.data || []).map((item) => ({
    id: item.id,
    title: item.title || '',
    preview: item.images?.fixed_height_small?.url || item.images?.fixed_height?.url,
    mp4: item.images?.fixed_height?.mp4 || item.images?.downsized_small?.mp4 || '',
    url: item.images?.fixed_height?.url,
    width: parseInt(item.images?.fixed_height?.width) || 200,
    height: parseInt(item.images?.fixed_height?.height) || 200,
  }));
}

export async function searchGifs(req, res) {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json({ gifs: [] });
    }

    const data = await giphyFetch('search', { q: q.trim() });
    res.json({ gifs: formatResults(data) });
  } catch (error) {
    console.error('GIF search error:', error);
    res.status(500).json({ error: 'Failed to search GIFs' });
  }
}

export async function trendingGifs(req, res) {
  try {
    const data = await giphyFetch('trending', {});
    res.json({ gifs: formatResults(data) });
  } catch (error) {
    console.error('GIF trending error:', error);
    res.status(500).json({ error: 'Failed to fetch trending GIFs' });
  }
}
