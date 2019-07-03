/*
  Heartbeat retries queued events
*/
export default function heartBeat(store, getPlugins, instance) {
  const timer = setInterval(() => {
    // console.log('____heartbeat_____')
    const pluginMethods = getPlugins()
    const { plugins, context, queue, user } = store.getState()
    // console.log('CURRENT Q', queue)
    const isOnline = !context.offline

    /* If network connection found and there is items in queue, process them all */
    if (isOnline && queue && queue.actions && queue.actions.length) {
      const pipeline = queue.actions.reduce((acc, item, index) => {
        const isLoaded = plugins[item.plugin].loaded
        if (isLoaded) {
          acc.process.push(item)
          acc.processIndex.push(index)
        } else {
          acc.requeue.push(item)
          acc.requeueIndex.push(index)
        }
        return acc
      }, {
        processIndex: [],
        process: [],
        requeue: [],
        requeueIndex: []
      })

      if (pipeline.processIndex && pipeline.processIndex.length) {
        pipeline.processIndex.forEach((i) => {
          const processAction = queue.actions[i]
          // console.log('RePROCESS THIS>', processAction)
          // Call methods directly right now
          const currentPlugin = processAction.plugin
          const currentMethod = processAction.payload.type
          const method = pluginMethods[currentPlugin][currentMethod]
          if (method && typeof method === 'function') {
            /* enrich queued payload with userId / anon id if missing */
            /* TODO hoist enrich into where action queued? */
            const enrichedPayload = enrich(processAction.payload, user)
            method({
              payload: enrichedPayload,
              config: plugins[currentPlugin].config,
              instance,
            })

            /* Then redispatch for .on listeners / other middleware */
            const pluginEvent = `${currentMethod}:${currentPlugin}`
            store.dispatch({
              ...enrichedPayload,
              type: pluginEvent,
              /* Internal data for analytics engine */
              _: {
                called: pluginEvent,
                from: 'queueDrain'
              }
            })
          }
        })

        /* Removed processed actions */
        const reQueueActions = queue.actions.filter((value, index) => {
          return pipeline.processIndex.indexOf(index) === -1
        })

        /* Set queue actions. TODO refactor to non mutatable or move out of redux */
        queue.actions = reQueueActions
      }
    }
  }, 3000)
  return timer
}

function fixEmptyValues(obj, objTwo, key) {
  if (obj.hasOwnProperty(key) && !obj[key] && objTwo[key]) {
    // console.log('enrich', key)
    return Object.assign({}, obj, {
      [`${key}`]: objTwo[key]
    })
  }
  return obj
}

// Assign userId && anonymousId values if present in payload but null
function enrich(payload, user = {}) {
  const keys = ['userId', 'anonymousId']
  return keys.reduce((acc, key) => {
    const updated = fixEmptyValues(acc, user, key)
    // console.log('updated', updated)
    return updated
  }, payload)
}
