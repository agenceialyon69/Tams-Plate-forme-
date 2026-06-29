/*
# Vector embeddings for semantic search

1. New columns
- `memories.embedding` (vector(384)) — embedding sémantique
- `memories.search_vector` (tsvector) — full-text search

2. Indexes
- GIN index on search_vector
- ivfflat index on embedding

3. Functions
- `match_memories(query_embedding, match_threshold, match_count)` — recherche sémantique
- `update_memory_embedding()` — trigger pour générer l'embedding
*/

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(384);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_memories_search_vector ON memories USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);

-- Semantic search function
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
RETURNS TABLE(
  id int,
  title text,
  content text,
  type text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    m.id,
    m.title,
    m.content,
    m.type,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM memories m
  WHERE 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Full-text search update trigger
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('french', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', COALESCE(NEW.content, '')), 'B') ||
    setweight(to_tsvector('french', COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(NEW.tags)), ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memories_search_vector_update ON memories;
CREATE TRIGGER memories_search_vector_update
  BEFORE INSERT OR UPDATE ON memories
  FOR EACH ROW
  EXECUTE FUNCTION update_search_vector();
