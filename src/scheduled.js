// Scheduled cleanup — deletes photos older than the retention window from
// R2. Wired up via the Cron Trigger in wrangler.toml and invoked from the
// Worker's scheduled() export in src/worker.js.

const RETENTION_DAYS = 90;

export async function deleteExpiredPhotos(env){
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let cursor;

    do {
        const listing = await env.PHOTOS_BUCKET.list({ prefix: 'quotes/', cursor });
        for(const obj of listing.objects){
            if(obj.uploaded.getTime() < cutoff){
                await env.PHOTOS_BUCKET.delete(obj.key);
            }
        }
        cursor = listing.truncated ? listing.cursor : undefined;
    } while(cursor);
}
