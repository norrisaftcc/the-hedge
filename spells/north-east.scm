;; Beats a Binary Tree hedge from anywhere: every square opens north or east,
;; so this walk always reaches the north-east corner. Then study the plate.
(until (gate?)
  (if (open? north) (go north)
      (if (open? east) (go east)
          (stop))))
