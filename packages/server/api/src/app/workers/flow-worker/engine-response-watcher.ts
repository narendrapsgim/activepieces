import { logger } from '@sentry/utils'
import { StatusCodes } from 'http-status-codes'
import { pubSub } from '../../helper/pubsub'
import { system, SystemProp } from '@activepieces/server-shared'
import { apId } from '@activepieces/shared'

const listeners = new Map<string, (flowResponse: EngineHttpResponse) => void>()

export type EngineHttpResponse = {
    status: number
    body: unknown
    headers: Record<string, string>
}

type EngineResponseWithId = {
    requestId: string
    httpResponse: EngineHttpResponse
}

const WEBHOOK_TIMEOUT_MS =
    (system.getNumber(SystemProp.WEBHOOK_TIMEOUT_SECONDS) ?? 30) * 1000
const HANDLER_ID = apId()
export const engineResponseWatcher = {
    getHandlerId(): string {
        return HANDLER_ID
    },
    async init(): Promise<void> {
        logger.info('[engineWatcher#init] Initializing engine run watcher')

        await pubSub.subscribe(
            `engine-run:sync:${HANDLER_ID}`,
            (_channel, message) => {
                const parsedMessasge: EngineResponseWithId = JSON.parse(message)
                const listener = listeners.get(parsedMessasge.requestId)
                if (listener) {
                    listener(parsedMessasge.httpResponse)
                    listeners.delete(parsedMessasge.requestId)
                }
                logger.info(
                    `[engineWatcher#init] message=${parsedMessasge.requestId}`,
                )
            },
        )
    },
    async listen(requestId: string, timeoutRequest: boolean): Promise<EngineHttpResponse> {
        logger.info(`[engineWatcher#listen] requestId=${requestId}`)
        return new Promise((resolve) => {
            const defaultResponse: EngineHttpResponse = {
                status: StatusCodes.NO_CONTENT,
                body: {},
                headers: {},
            }
            const responseHandler = (flowResponse: EngineHttpResponse) => {
                clearTimeout(timeout)
                resolve(flowResponse)
            }
            let timeout: NodeJS.Timeout
            if (!timeoutRequest) {
                listeners.set(requestId, resolve)
            }
            else {
                timeout = setTimeout(() => {
                    resolve(defaultResponse)
                }, WEBHOOK_TIMEOUT_MS)
                listeners.set(requestId, responseHandler)
            }
        })
    },
    async publish(
        requestId: string,
        workerHandlerId: string,
        httpResponse: EngineHttpResponse,
    ): Promise<void> {
        logger.info(`[engineWatcher#publish] requestId=${requestId}`)
        const message: EngineResponseWithId = { requestId, httpResponse }
        await pubSub.publish(`engine-run:sync:${workerHandlerId}`, JSON.stringify(message))
    },
    async shutdown(): Promise<void> {
        await pubSub.unsubscribe(`engine-run:sync:${HANDLER_ID}`)
    },
}
