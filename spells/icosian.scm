;; Hamilton's walk, from the Icosian game of 1857: on the twenty caves of the
;; twelve-sided die, this word of lefts and rights, said twice, visits every
;; cave once and comes home. It works from any tunnel, because every tunnel
;; of the die is like every other. Left and right are from the tunnel you
;; came by; from the stair at the mouth, go ahead first.
(go ahead)
(until (gate?)
  (go left) (go left) (go left)
  (go right) (go right) (go right)
  (go left) (go right) (go left) (go right))
