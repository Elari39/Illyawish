package rag

import "math"

func cosineSimilarity(left []float32, right []float32) float32 {
	size := len(left)
	if len(right) < size {
		size = len(right)
	}
	if size == 0 {
		return 0
	}

	var dot float64
	var leftNorm float64
	var rightNorm float64
	for index := 0; index < size; index++ {
		l := float64(left[index])
		r := float64(right[index])
		dot += l * r
		leftNorm += l * l
		rightNorm += r * r
	}
	if leftNorm == 0 || rightNorm == 0 {
		return 0
	}
	return float32(dot / (math.Sqrt(leftNorm) * math.Sqrt(rightNorm)))
}
