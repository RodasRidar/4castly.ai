import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/cn'

export interface StreamingTextProps {
  /** Markdown source received so far. */
  children: string
  /** Shows the blinking cursor and marks the region busy. */
  streaming?: boolean
  className?: string
}

export function StreamingText({ children, streaming = false, className }: StreamingTextProps) {
  return (
    <div aria-live="polite" aria-busy={streaming} className={cn('text-body-md text-body [&>*+*]:mt-3', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          ul: (p) => <ul className="list-disc pl-5" {...omitNode(p)} />,
          ol: (p) => <ol className="list-decimal pl-5" {...omitNode(p)} />,
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-body-sm" {...omitNode(p)} />
            </div>
          ),
          th: (p) => <th className="border-b border-hairline px-2 py-1 text-left font-medium text-ink" {...omitNode(p)} />,
          td: (p) => <td className="border-b border-hairline px-2 py-1" {...omitNode(p)} />,
          strong: (p) => <strong className="font-medium text-ink" {...omitNode(p)} />,
        }}
      >
        {children}
      </Markdown>
      {streaming && (
        <span
          data-testid="streaming-cursor"
          aria-hidden="true"
          className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-ink motion-reduce:animate-none"
        />
      )}
    </div>
  )
}

function omitNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const { node: _node, ...rest } = props
  return rest
}
