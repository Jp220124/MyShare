// Cloudflare Worker for R2 file handling
// Deploy this as a separate Cloudflare Worker

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handlers
      if (url.pathname === '/get-upload-url' && request.method === 'POST') {
        return await handleGetUploadUrl(request, env, corsHeaders);
      }
      
      if (url.pathname === '/delete-file' && request.method === 'DELETE') {
        return await handleDeleteFile(request, env, corsHeaders);
      }
      
      if (url.pathname.startsWith('/download/') && request.method === 'GET') {
        return await handleDownload(request, env, corsHeaders);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
      
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },

  // Scheduled handler for auto-deletion (runs daily)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupOldFiles(env));
  },
};

async function handleGetUploadUrl(request, env, corsHeaders) {
  const { fileName, fileType, fileSize } = await request.json();
  
  // Generate unique file ID
  const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const key = `files/${fileId}/${fileName}`;
  
  // Create presigned PUT URL (valid for 1 hour)
  const uploadUrl = await env.R2_BUCKET.createPresignedUrl(key, {
    method: 'PUT',
    expiresIn: 3600,
  });
  
  // Store metadata in KV (for auto-deletion)
  await env.FILE_METADATA.put(fileId, JSON.stringify({
    key,
    fileName,
    fileType,
    fileSize,
    uploadedAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
  }), {
    expirationTtl: 24 * 60 * 60, // Auto-delete KV entry after 24 hours
  });
  
  // Generate download URL
  const downloadUrl = `${new URL(request.url).origin}/download/${fileId}`;
  
  return new Response(JSON.stringify({
    uploadUrl,
    downloadUrl,
    fileId,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleDownload(request, env, corsHeaders) {
  const url = new URL(request.url);
  const fileId = url.pathname.split('/download/')[1];
  
  // Get file metadata from KV
  const metadataStr = await env.FILE_METADATA.get(fileId);
  if (!metadataStr) {
    return new Response('File not found or expired', { 
      status: 404, 
      headers: corsHeaders 
    });
  }
  
  const metadata = JSON.parse(metadataStr);
  
  // Check if file has expired
  if (Date.now() > metadata.expiresAt) {
    // Delete expired file
    await env.R2_BUCKET.delete(metadata.key);
    await env.FILE_METADATA.delete(fileId);
    return new Response('File has expired', { 
      status: 410, 
      headers: corsHeaders 
    });
  }
  
  // Get file from R2
  const object = await env.R2_BUCKET.get(metadata.key);
  if (!object) {
    return new Response('File not found', { 
      status: 404, 
      headers: corsHeaders 
    });
  }
  
  // Return file with appropriate headers
  const headers = new Headers(object.headers);
  headers.set('Content-Type', metadata.fileType || 'application/octet-stream');
  headers.set('Content-Disposition', `inline; filename="${metadata.fileName}"`);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  return new Response(object.body, { headers });
}

async function handleDeleteFile(request, env, corsHeaders) {
  const { fileId } = await request.json();
  
  // Get metadata
  const metadataStr = await env.FILE_METADATA.get(fileId);
  if (!metadataStr) {
    return new Response(JSON.stringify({ success: false, error: 'File not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  const metadata = JSON.parse(metadataStr);
  
  // Delete from R2 and KV
  await env.R2_BUCKET.delete(metadata.key);
  await env.FILE_METADATA.delete(fileId);
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function cleanupOldFiles(env) {
  // List all files in KV
  const { keys } = await env.FILE_METADATA.list();
  
  for (const key of keys) {
    const metadataStr = await env.FILE_METADATA.get(key.name);
    if (!metadataStr) continue;
    
    const metadata = JSON.parse(metadataStr);
    
    // Check if file has expired
    if (Date.now() > metadata.expiresAt) {
      console.log(`Deleting expired file: ${metadata.fileName} (ID: ${key.name})`);
      
      // Delete from R2
      await env.R2_BUCKET.delete(metadata.key);
      
      // Delete from KV
      await env.FILE_METADATA.delete(key.name);
    }
  }
}