// Simple R2 Worker for WebShare
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Upload file
      if (url.pathname === '/upload' && request.method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
          return new Response(JSON.stringify({ error: 'No file provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Generate unique filename
        const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const ext = file.name.split('.').pop();
        const key = `files/${fileId}.${ext}`;

        // Upload to R2
        await env.BUCKET.put(key, file.stream(), {
          httpMetadata: {
            contentType: file.type,
          },
          customMetadata: {
            originalName: file.name,
            uploadTime: new Date().toISOString(),
          }
        });

        // Return download URL
        const downloadUrl = `${url.origin}/download/${fileId}.${ext}`;
        
        return new Response(JSON.stringify({
          success: true,
          url: downloadUrl,
          fileId: fileId,
          fileName: file.name
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Download file
      if (url.pathname.startsWith('/download/') && request.method === 'GET') {
        const fileName = url.pathname.replace('/download/', '');
        const key = `files/${fileName}`;
        
        const object = await env.BUCKET.get(key);
        
        if (!object) {
          return new Response('File not found', { 
            status: 404, 
            headers: corsHeaders 
          });
        }

        const headers = new Headers(object.httpMetadata || {});
        headers.set('Content-Disposition', `inline; filename="${object.customMetadata?.originalName || fileName}"`);
        Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));

        return new Response(object.body, { headers });
      }

      // Delete file (optional)
      if (url.pathname.startsWith('/delete/') && request.method === 'DELETE') {
        const fileName = url.pathname.replace('/delete/', '');
        const key = `files/${fileName}`;
        
        await env.BUCKET.delete(key);
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Health check
      if (url.pathname === '/' && request.method === 'GET') {
        return new Response('R2 File Service - Active', {
          headers: corsHeaders
        });
      }

      return new Response('Not Found', { 
        status: 404, 
        headers: corsHeaders 
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};